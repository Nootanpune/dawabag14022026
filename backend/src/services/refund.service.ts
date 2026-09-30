// src/services/refund.service.ts — the refund ledger (Rulebook C-37, C-45)
// A refund is split into legs, in this order:
//   1. credit_adjustment — an unpaid credit (B2B) bill is reduced
//   2. gateway           — back to the card/UPI through Razorpay
//   3. wallet            — the part the buyer paid from the Dawabag wallet
//   4. manual            — anything left, paid by accounts (bank transfer)
// Legs 1 and 3 settle inside the caller's transaction. Gateway legs are sent to
// Razorpay after commit (sendGatewayRefunds); without keys they stay pending
// for accounts to process and mark done.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { logger } from '../config/logger';
import { getRazorpay, razorpayConfigured } from './razorpay.client';

export type RefundSource = 'cancellation' | 'return' | 'admin';

interface Leg { method: 'credit_adjustment' | 'gateway' | 'wallet' | 'manual'; amount: number; paymentId?: string }

async function planLegs(client: PoolClient, orderId: string, amount: number): Promise<Leg[]> {
  const o = (await client.query(
    `SELECT total_paise, wallet_used_paise, payment_terms, credit_settled_at, credit_adjusted_paise
     FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
  if (!o) throw new AppError('Order not found', 404);
  const legs: Leg[] = [];
  let left = amount;
  const take = (method: Leg['method'], cap: number, paymentId?: string) => {
    const a = Math.min(left, Math.max(cap, 0));
    if (a > 0) { legs.push({ method, amount: a, paymentId }); left -= a; }
  };

  if (o.payment_terms !== 'prepaid' && !o.credit_settled_at) {
    take('credit_adjustment', o.total_paise - o.credit_adjusted_paise);
  }
  const pays = (await client.query(
    `SELECT p.gateway_payment_id, p.amount_paise - COALESCE(p.refund_amount_paise, 0)
            - COALESCE((SELECT SUM(r.amount_paise) FROM refunds r WHERE r.gateway_payment_id = p.gateway_payment_id
                        AND r.method = 'gateway' AND r.status = 'pending'), 0) AS refundable
     FROM payments p WHERE p.order_id = $1 AND p.status IN ('captured', 'partially_refunded')
       AND p.gateway_payment_id IS NOT NULL`, [orderId])).rows;
  for (const p of pays) take('gateway', Number(p.refundable), p.gateway_payment_id);
  const walletBack = Number((await client.query(
    `SELECT COALESCE(SUM(amount_paise), 0) AS n FROM refunds WHERE order_id = $1 AND method = 'wallet'`, [orderId])).rows[0].n);
  take('wallet', o.wallet_used_paise - walletBack);
  if (left > 0) legs.push({ method: 'manual', amount: left });
  return legs;
}

// Records the refund legs; returns ids of gateway legs to send after commit
export async function recordRefund(
  client: PoolClient,
  r: { orderId: string; amountPaise: number; source: RefundSource; returnId?: string | null; userId: string | null },
): Promise<{ legs: any[]; gatewayRefundIds: string[] }> {
  if (r.amountPaise <= 0) return { legs: [], gatewayRefundIds: [] };
  const o = (await client.query('SELECT user_id FROM orders WHERE id = $1', [r.orderId])).rows[0];
  const legs = await planLegs(client, r.orderId, r.amountPaise);
  const out: any[] = [];
  const gatewayRefundIds: string[] = [];
  for (const leg of legs) {
    const settledNow = leg.method === 'credit_adjustment' || leg.method === 'wallet';
    const row = (await client.query(
      `INSERT INTO refunds (order_id, return_id, source, method, amount_paise, status, gateway_payment_id,
         requested_by, processed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, method, amount_paise, status`,
      [r.orderId, r.returnId ?? null, r.source, leg.method, leg.amount, settledNow ? 'processed' : 'pending',
       leg.paymentId ?? null, r.userId, settledNow ? new Date() : null])).rows[0];
    if (leg.method === 'credit_adjustment') {
      await client.query(`UPDATE orders SET credit_adjusted_paise = credit_adjusted_paise + $2 WHERE id = $1`, [r.orderId, leg.amount]);
      await client.query(`UPDATE users SET credit_used_paise = GREATEST(credit_used_paise - $2, 0) WHERE id = $1`, [o.user_id, leg.amount]);
    } else if (leg.method === 'wallet') {
      await client.query(`UPDATE user_profiles SET wallet_balance_paise = wallet_balance_paise + $2 WHERE user_id = $1`, [o.user_id, leg.amount]);
      await client.query(
        `INSERT INTO wallet_transactions (user_id, type, amount_paise, reason, reference_id) VALUES ($1, 'credit', $2, $3, $4)`,
        [o.user_id, leg.amount, `Refund (${r.source})`, row.id]);
    } else if (leg.method === 'gateway') {
      gatewayRefundIds.push(row.id);
    }
    out.push(row);
  }
  await writeAuditTx(client, { userId: o.user_id, action: 'refund_recorded', performedBy: r.userId,
    newValue: { order_id: r.orderId, source: r.source, return_id: r.returnId ?? null, legs: out } });
  return { legs: out, gatewayRefundIds };
}

// After commit: send pending gateway legs to Razorpay
export async function sendGatewayRefunds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (!razorpayConfigured()) {
    await query(`UPDATE refunds SET failure_reason = 'Payment gateway not configured; process manually' WHERE id = ANY($1)`, [ids]);
    return;
  }
  for (const id of ids) {
    const r = (await query<any>(`SELECT * FROM refunds WHERE id = $1 AND status = 'pending'`, [id]))[0];
    if (!r) continue;
    try {
      const g: any = await getRazorpay().payments.refund(r.gateway_payment_id, { amount: r.amount_paise, speed: 'normal',
        notes: { refund_id: r.id, source: r.source } });
      await withTransaction(async (client) => {
        await client.query(`UPDATE refunds SET gateway_refund_id = $2, failure_reason = NULL WHERE id = $1`, [id, g.id]);
        if (g.status === 'processed') await settleGatewayLeg(client, id);
      });
    } catch (e: any) {
      logger.error(`Gateway refund ${id} failed: ${e?.message || e}`);
      await query(`UPDATE refunds SET failure_reason = $2 WHERE id = $1`, [id, String(e?.error?.description || e?.message || e).slice(0, 500)]);
    }
  }
}

// Marks a gateway leg processed and rolls the amount into payments
export async function settleGatewayLeg(client: PoolClient, refundId: string, processedBy: string | null = null) {
  const r = (await client.query(
    `UPDATE refunds SET status = 'processed', processed_at = NOW(), processed_by = COALESCE($2, processed_by)
     WHERE id = $1 AND status = 'pending' RETURNING gateway_payment_id, amount_paise, method`, [refundId, processedBy])).rows[0];
  if (!r || r.method !== 'gateway') return;
  await client.query(
    `UPDATE payments SET refund_amount_paise = COALESCE(refund_amount_paise, 0) + $2, refunded_at = NOW(),
       status = CASE WHEN COALESCE(refund_amount_paise, 0) + $2 >= amount_paise THEN 'refunded' ELSE 'partially_refunded' END
     WHERE gateway_payment_id = $1`, [r.gateway_payment_id, r.amount_paise]);
}

// Accounts marks a pending gateway/manual leg as paid (dashboard refund or bank transfer)
export async function markRefundProcessed(adminId: string, refundId: string, reference: string) {
  return withTransaction(async (client) => {
    const r = (await client.query(`SELECT * FROM refunds WHERE id = $1 FOR UPDATE`, [refundId])).rows[0];
    if (!r) throw new AppError('Refund not found', 404);
    if (r.status !== 'pending') throw new AppError(`Refund is already ${r.status}`, 409);
    await client.query(`UPDATE refunds SET reference = $2 WHERE id = $1`, [refundId, reference]);
    if (r.method === 'gateway') await settleGatewayLeg(client, refundId, adminId);
    else await client.query(`UPDATE refunds SET status = 'processed', processed_at = NOW(), processed_by = $2 WHERE id = $1`, [refundId, adminId]);
    await writeAuditTx(client, { userId: null, action: 'refund_processed', performedBy: adminId,
      newValue: { refund_id: refundId, order_id: r.order_id, amount_paise: r.amount_paise, reference } });
    return { id: refundId, status: 'processed' };
  });
}

export async function listRefunds(filter: { status?: string; userId?: string; orderId?: string }) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { params.push(filter.status); where.push(`r.status = $${params.length}`); }
  if (filter.userId) { params.push(filter.userId); where.push(`o.user_id = $${params.length}`); }
  if (filter.orderId) { params.push(filter.orderId); where.push(`r.order_id = $${params.length}`); }
  return query(
    `SELECT r.id, r.order_id, o.order_number, r.return_id, r.source, r.method, r.amount_paise, r.status,
            r.gateway_refund_id, r.reference, r.failure_reason, r.created_at, r.processed_at
     FROM refunds r JOIN orders o ON o.id = r.order_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC LIMIT 500`, params);
}
