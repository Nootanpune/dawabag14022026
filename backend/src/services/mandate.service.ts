// src/services/mandate.service.ts
// Payment mandates for automatic refill charges (owner decision 2026-09-30),
// via Razorpay recurring payments (customer + token). RBI rules for recurring
// payments apply: the buyer authorises once; each charge is preceded by a
// pre-debit notice (our refill reminder); charges above the card/UPI
// auto-debit limit need fresh authentication, so those refills get a pay link
// instead. Exercised against the fake gateway (test/sprint11); confirm with
// Razorpay test mode before going live.
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { writeAudit, writeAuditTx } from '../utils/audit';
import { getRazorpay } from './razorpay.client';

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
// the payment.captured webhook (payments/capture.service).
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

// Mandate side of a captured payment: the ₹1 authorisation that registers the token
export async function activateMandateFromCapture(client: PoolClient, p: { order_id: string; token_id?: string }): Promise<boolean> {
  const mandate = (await client.query(
    `SELECT id, user_id FROM payment_mandates WHERE gateway_order_id = $1 FOR UPDATE`, [p.order_id])).rows[0];
  if (!mandate) return false;
  if (p.token_id) {
    const r = await client.query(
      `UPDATE payment_mandates SET status = 'active', gateway_token_id = $2, activated_at = NOW() WHERE id = $1 AND status = 'pending'`,
      [mandate.id, p.token_id]);
    if (r.rowCount) await writeAuditTx(client, { userId: mandate.user_id, action: 'mandate_activated', newValue: { mandate_id: mandate.id } });
  }
  return true;   // the authorisation payment is not an order payment
}

// token.confirmed / token.rejected / token.cancelled webhooks (e-mandates confirm later than the payment)
export async function applyTokenEvent(event: string, token: { id: string; customer_id?: string }): Promise<string> {
  return withTransaction(async (client) => {
    // A confirmation may name a token we have not seen yet (the customer's pending mandate);
    // a rejection or cancellation acts only on the mandate holding that exact token
    const m = (await client.query(
      event === 'token.confirmed'
        ? `SELECT id, user_id, status FROM payment_mandates
           WHERE gateway_token_id = $1 OR (gateway_customer_id = $2 AND gateway_token_id IS NULL AND status = 'pending')
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
        : `SELECT id, user_id, status FROM payment_mandates WHERE gateway_token_id = $1
           UNION ALL
           SELECT id, user_id, status FROM payment_mandates
           WHERE NOT EXISTS (SELECT 1 FROM payment_mandates WHERE gateway_token_id = $1)
             AND gateway_customer_id = $2 AND gateway_token_id IS NULL AND status = 'pending'
             AND (SELECT COUNT(*) FROM payment_mandates WHERE gateway_customer_id = $2 AND gateway_token_id IS NULL AND status = 'pending') = 1
           LIMIT 1`, [token.id, token.customer_id ?? null])).rows[0];
    if (!m) return 'no matching mandate';
    if (event === 'token.confirmed') {
      if (m.status !== 'pending') return `mandate already ${m.status}`;
      await client.query(`UPDATE payment_mandates SET status = 'active', gateway_token_id = $2, activated_at = NOW() WHERE id = $1`, [m.id, token.id]);
      await writeAuditTx(client, { userId: m.user_id, action: 'mandate_activated', newValue: { mandate_id: m.id } });
      return 'mandate activated';
    }
    const status = event === 'token.rejected' ? 'failed' : 'cancelled';
    await client.query(`UPDATE payment_mandates SET status = $2, cancelled_at = NOW() WHERE id = $1 AND status <> $2`, [m.id, status]);
    await client.query(`UPDATE refill_subscriptions SET mandate_id = NULL, auto_charge = FALSE WHERE mandate_id = $1`, [m.id]);
    await writeAuditTx(client, { userId: m.user_id, action: `mandate_${status}`, newValue: { mandate_id: m.id, event } });
    return `mandate ${status}; refills switched to pay links`;
  });
}
