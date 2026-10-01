// src/services/mandate.service.ts
// Payment mandates for automatic refill charges (owner decision 2026-09-30),
// via Razorpay recurring payments (customer + token). RBI rules for recurring
// payments apply: the buyer authorises once; each charge is preceded by a
// pre-debit notice (our refill reminder); charges above the card/UPI
// auto-debit limit need fresh authentication, so those refills get a pay link
// instead. NOT exercised against Razorpay in this environment (no keys) —
// test in Razorpay test mode before enabling.
import { PoolClient } from 'pg';
import { recordRefund, sendGatewayRefunds } from './refund.service';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { writeAudit, writeAuditTx } from '../utils/audit';
import { getRazorpay } from './razorpay.client';
import { moveOrderToFulfilment } from './paymentCapture.service';

// Per-charge limit without additional authentication — CA/Razorpay to confirm
export const AUTO_DEBIT_LIMIT_PAISE = 15000_00;

export async function startMandate(userId: string, maxAmountPaise: number, method: 'upi' | 'card') {
  if (maxAmountPaise > AUTO_DEBIT_LIMIT_PAISE) {
    throw new AppError(`Automatic charges are limited to ₹${AUTO_DEBIT_LIMIT_PAISE / 100} per refill`, 400);
  }
  const user = await queryOne<{ mobile: string; email: string | null; full_name: string | null }>(
    `SELECT u.mobile, u.email, up.full_name FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`,
    [userId]);
  if (!user) throw new AppError('User not found', 404);

  const rzp: any = getRazorpay();
  const customer = await rzp.customers.create({
    name: user.full_name || 'Dawabag customer', contact: user.mobile, email: user.email || undefined, fail_existing: '0',
  });
  // Authorisation order (₹1) that registers the token
  const order = await rzp.orders.create({
    amount: 100, currency: 'INR', customer_id: customer.id, method, payment_capture: true,
    token: { max_amount: maxAmountPaise, expire_at: Math.floor(Date.now() / 1000) + 5 * 365 * 24 * 3600, frequency: 'as_presented' },
    notes: { purpose: 'refill_mandate', user_id: userId },
  });
  const m = await queryOne<{ id: string }>(
    `INSERT INTO payment_mandates (user_id, gateway_customer_id, gateway_order_id, method, max_amount_paise)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, customer.id, order.id, method, maxAmountPaise]);
  await writeAudit({ userId, action: 'mandate_started', performedBy: userId, newValue: { mandate_id: m!.id, method, max_amount_paise: maxAmountPaise } });
  // The app opens Razorpay Checkout with these (recurring: '1')
  return { mandate_id: m!.id, razorpay_order_id: order.id, customer_id: customer.id, key_id: process.env.RAZORPAY_KEY_ID, recurring: '1' };
}

export async function listMandates(userId: string) {
  return query(
    `SELECT id, method, max_amount_paise, status, created_at, activated_at, cancelled_at
     FROM payment_mandates WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
}

export async function cancelMandate(userId: string, mandateId: string) {
  const m = await queryOne<any>(`SELECT * FROM payment_mandates WHERE id = $1 AND user_id = $2`, [mandateId, userId]);
  if (!m) throw new AppError('Mandate not found', 404);
  if (m.status === 'cancelled') return { id: mandateId, status: 'cancelled' };
  if (m.gateway_token_id) {
    try { await (getRazorpay() as any).customers.deleteToken(m.gateway_customer_id, m.gateway_token_id); }
    catch (err) { logger.error(`Razorpay token delete failed for mandate ${mandateId}: ${(err as Error).message}`); }
  }
  await query(`UPDATE payment_mandates SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [mandateId]);
  await query(`UPDATE refill_subscriptions SET mandate_id = NULL, auto_charge = FALSE WHERE mandate_id = $1`, [mandateId]);
  await writeAudit({ userId, action: 'mandate_cancelled', performedBy: userId, newValue: { mandate_id: mandateId } });
  return { id: mandateId, status: 'cancelled' };
}

// Charges a refill order on the buyer's active mandate. Capture is confirmed by
// the payment.captured webhook (handleRecurringCapture).
export async function chargeOrderOnMandate(
  orderId: string, mandateId: string
): Promise<{ charged: boolean; reason?: string }> {
  const m = await queryOne<any>(`SELECT * FROM payment_mandates WHERE id = $1 AND status = 'active'`, [mandateId]);
  if (!m) return { charged: false, reason: 'no active mandate' };
  const o = await queryOne<any>(
    `SELECT o.id, o.order_number, o.total_paise, o.status, u.mobile, u.email
     FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [orderId]);
  if (!o || o.status !== 'pending_payment') return { charged: false, reason: 'order not awaiting payment' };
  if (o.total_paise > m.max_amount_paise) return { charged: false, reason: 'amount above the mandate limit' };

  const rzp: any = getRazorpay();
  const rOrder = await rzp.orders.create({ amount: o.total_paise, currency: 'INR', payment_capture: true,
    notes: { order_id: orderId, purpose: 'refill_auto_charge' } });
  await query(
    `INSERT INTO payments (order_id, gateway, gateway_order_id, status, amount_paise)
     VALUES ($1, 'razorpay', $2, 'created', $3) ON CONFLICT (gateway_order_id) DO NOTHING`,
    [orderId, rOrder.id, o.total_paise]);
  await rzp.payments.createRecurringPayment({
    email: o.email || 'noreply@dawabag.in', contact: o.mobile, amount: o.total_paise, currency: 'INR',
    order_id: rOrder.id, customer_id: m.gateway_customer_id, token: m.gateway_token_id, recurring: '1',
    description: `Dawabag refill ${o.order_number}`,
  });
  return { charged: true };
}

// Webhook side: activates a mandate on its authorisation payment, and records
// captured recurring charges against their order.
export async function handleRecurringCapture(event: string, payload: any): Promise<void> {
  if (event !== 'payment.captured') return;
  const p = payload?.payment?.entity;
  if (!p?.order_id) return;

  const lateRefundIds = await withTransaction(async (client: PoolClient): Promise<string[]> => {
    const mandate = (await client.query(
      `SELECT id, user_id FROM payment_mandates WHERE gateway_order_id = $1 AND status = 'pending' FOR UPDATE`,
      [p.order_id])).rows[0];
    if (mandate) {
      if (!p.token_id) return [];
      await client.query(
        `UPDATE payment_mandates SET status = 'active', gateway_token_id = $2, activated_at = NOW() WHERE id = $1`,
        [mandate.id, p.token_id]);
      await writeAuditTx(client, { userId: mandate.user_id, action: 'mandate_activated', newValue: { mandate_id: mandate.id } });
      return [];
    }

    const pay = (await client.query(
      `SELECT order_id, amount_paise, status FROM payments WHERE gateway_order_id = $1 FOR UPDATE`, [p.order_id])).rows[0];
    if (!pay || ['captured', 'partially_refunded', 'refunded'].includes(pay.status)) return [];
    if (Number(p.amount) !== Number(pay.amount_paise)) {
      logger.error(`Captured amount mismatch for gateway order ${p.order_id}`);
      return [];
    }
    await client.query(
      `UPDATE payments SET status = 'captured', gateway_payment_id = $2, method = $3, paid_at = NOW()
       WHERE gateway_order_id = $1`, [p.order_id, p.id, p.method]);
    // Money arriving for an order that was already cancelled goes straight back
    const order = (await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [pay.order_id])).rows[0];
    if (!['pending_payment', 'payment_failed'].includes(order.status)) {
      const back = await recordRefund(client, { orderId: pay.order_id, amountPaise: Number(p.amount), source: 'cancellation', userId: null });
      await writeAuditTx(client, { userId: null, action: 'payment_after_close_refunded',
        newValue: { order_id: pay.order_id, order_status: order.status, gateway_payment_id: p.id } });
      return back.gatewayRefundIds;
    }
    const status = await moveOrderToFulfilment(client, pay.order_id);
    await writeAuditTx(client, { userId: null, action: 'payment_captured_webhook',
      newValue: { order_id: pay.order_id, gateway_payment_id: p.id, order_status: status } });
    return [];
  });
  await sendGatewayRefunds(lateRefundIds);
}
