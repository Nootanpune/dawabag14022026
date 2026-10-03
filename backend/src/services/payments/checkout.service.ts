// Order checkout through Razorpay: the order to pay, then the app's signed
// confirmation. The capture itself is recorded by capture.service, the same way
// a webhook or the reconciliation sweep would record it.
import { pool, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { getRazorpay, validCheckoutSignature } from '../razorpay.client';
import { applyCapture } from './capture.service';
import { assertOrderPayable } from '../emergencyStop/state.service';
import { assertPrescriptionProvided } from '../prescriptions/requirement.service';
import { needsManualCapture, recordAuthorisation, rxHoldSettings } from './rxHold/hold.service';
import { HOLD_WORDING, gatewayCaptureOptions } from './rxHold/rules';

export async function createOrderPayment(userId: string, orderId: string) {
  const order = await queryOne<{ id: string; order_number: string; total_paise: number; status: string; user_id: string }>(
    'SELECT id, order_number, total_paise, status, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL', [orderId]);
  if (!order || order.user_id !== userId) throw new AppError('Order not found', 404);
  if (!['pending_payment', 'payment_failed'].includes(order.status)) throw new AppError('Order is not waiting for payment', 400);
  if (order.total_paise <= 0) throw new AppError('Nothing to pay on this order', 400);
  // Emergency stop (Sprint 38): an unpaid order holding prescription medicines is not taken further (C-08)
  await assertOrderPayable(pool, order.id);
  // Sprint 39: no payment for prescription medicines without a prescription attached (C-08);
  // such an order is only authorised now and captured after the pharmacist check (C-37)
  const manual = await withTransaction(async (c) => {
    await assertPrescriptionProvided(c, order.id);
    return needsManualCapture(c, order.id);
  });
  const rzpOrder: any = await getRazorpay().orders.create({
    amount: order.total_paise, currency: 'INR', receipt: order.order_number,
    ...gatewayCaptureOptions(manual, await rxHoldSettings()),
    notes: { order_id: order.id },
  } as any);
  await pool.query(`INSERT INTO payments (order_id, gateway, gateway_order_id, status, amount_paise, capture_mode) VALUES ($1, 'razorpay', $2, 'created', $3, $4)
               ON CONFLICT (gateway_order_id) DO NOTHING`, [order.id, rzpOrder.id, order.total_paise, manual ? 'manual' : 'automatic']);
  return { razorpay_order_id: rzpOrder.id, razorpay_key_id: process.env.RAZORPAY_KEY_ID, amount: order.total_paise, currency: 'INR', order_number: order.order_number,
    capture: manual ? 'after_pharmacist_check' as const : 'now' as const, ...(manual ? { charge_note: HOLD_WORDING.checkout } : {}) };
}

export async function verifyOrderPayment(userId: string, v: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  // The order is the one this Razorpay order was made for, and the caller's own
  const owned = await queryOne<{ order_id: string; amount_paise: number; status: string; capture_mode: string }>(
    `SELECT p.order_id, p.amount_paise, p.status, p.capture_mode FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.gateway_order_id = $1 AND o.user_id = $2`, [v.razorpay_order_id, userId]);
  if (!owned) throw new AppError('Payment not found for this account', 404);
  if (!validCheckoutSignature(v.razorpay_order_id, v.razorpay_payment_id, v.razorpay_signature)) {
    throw new AppError('Payment verification failed — invalid signature', 400);
  }
  let payment: any = await getRazorpay().payments.fetch(v.razorpay_payment_id);
  if (payment.order_id !== v.razorpay_order_id || Number(payment.amount) !== owned.amount_paise) throw new AppError('Payment does not match this order', 400);
  // Sprint 39: a prescription order stays authorised until the pharmacist check passes
  if (owned.capture_mode === 'manual' && payment.status === 'authorized') {
    const r = await recordAuthorisation(payment, userId);
    if (r?.outcome.startsWith('order already closed')) throw new AppError(`This order was already closed, so the payment was not taken. ${HOLD_WORDING.released}`, 409);
    const o = await queryOne<{ status: string }>('SELECT status FROM orders WHERE id = $1', [owned.order_id]);
    return { order_id: owned.order_id, payment_id: v.razorpay_payment_id, status: o?.status, payment_status: 'authorized' as const,
      charge_note: HOLD_WORDING.checkout };
  }
  // An authorisation alone is not money received: capture it, or refuse
  if (payment.status === 'authorized') payment = await getRazorpay().payments.capture(v.razorpay_payment_id, Number(payment.amount), 'INR');
  if (payment.status !== 'captured') throw new AppError(`Payment not captured. Status: ${payment.status}`, 400);
  const r = await applyCapture(payment, userId);
  if (r.outcome.startsWith('order already closed')) throw new AppError('This order was already closed, so the payment is being refunded', 409);
  const o = await queryOne<{ status: string }>('SELECT status FROM orders WHERE id = $1', [owned.order_id]);
  return { order_id: owned.order_id, payment_id: v.razorpay_payment_id, status: o?.status, payment_status: 'captured' as const };
}
