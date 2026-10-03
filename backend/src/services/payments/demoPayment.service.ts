// Demo payment on the owner's trial server (Sprint 26). No money moves and no gateway
// is called; the order (or consultation fee) is recorded as paid through the SAME code a
// captured Razorpay payment uses (capture.service → applyCapture), so the pharmacist
// queue (C-08), packing, invoices and notifications all go on exactly as for real money.
// Every demo payment is flagged: payments.gateway = 'demo', ids demo_order_… / demo_pay_…,
// and an audit entry with demo: true (C-46). Refused unless paymentMode() is 'demo'
// (APP_ENV=trial and no Razorpay keys; config/env.ts refuses DEMO_PAYMENTS elsewhere).
import crypto from 'crypto';
import { pool, query, queryOne, withTransaction } from '../../config/database';
import { assertOrderPayable } from '../emergencyStop/state.service';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { applyCapture } from './capture.service';
import { paymentFailed } from './webhook.service';
import { DEMO_ORDER_PREFIX, DEMO_PAYMENT_PREFIX, demoPaymentsEnabled, type PaymentMethod } from './paymentMode';

/** provider: the bank (netbanking) or wallet chosen in the demo checkout — audit only (Sprint 27) */
export interface DemoPaymentInput { method: PaymentMethod; outcome: 'success' | 'failure'; provider?: string }

const via = (input: DemoPaymentInput) => (input.provider ? { provider: input.provider } : {});

export function assertDemoPayments(): void {
  // Same answer as "this route does not exist" outside a trial without keys
  if (!demoPaymentsEnabled()) throw new AppError('Not found', 404);
}

const ids = () => {
  const r = crypto.randomBytes(9).toString('hex');
  return { order: `${DEMO_ORDER_PREFIX}${r}`, payment: `${DEMO_PAYMENT_PREFIX}${r}` };
};

export async function payOrderDemo(userId: string, orderId: string, input: DemoPaymentInput) {
  assertDemoPayments();
  const order = await queryOne<{ id: string; order_number: string; total_paise: number; status: string; user_id: string }>(
    'SELECT id, order_number, total_paise, status, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL', [orderId]);
  if (!order || order.user_id !== userId) throw new AppError('Order not found', 404);
  if (!['pending_payment', 'payment_failed'].includes(order.status)) throw new AppError('This order is already paid or closed', 409);
  if (order.total_paise <= 0) throw new AppError('Nothing to pay on this order', 400);
  await assertOrderPayable(pool, order.id);   // emergency stop (Sprint 38, C-08)

  const id = ids();
  await query(`INSERT INTO payments (order_id, gateway, gateway_order_id, status, amount_paise, method)
               VALUES ($1, 'demo', $2, 'created', $3, $4)`, [order.id, id.order, order.total_paise, input.method]);
  if (input.outcome === 'failure') {
    // As Razorpay's payment.failed webhook does: the payment fails, the order waits for another try
    await paymentFailed({ order_id: id.order });
    await writeAudit({ userId, action: 'demo_payment_failed', performedBy: userId,
      newValue: { demo: true, order_id: order.id, gateway_order_id: id.order, method: input.method, ...via(input), amount_paise: order.total_paise } });
    const o = await queryOne<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
    return { order_id: order.id, paid: false, demo: true, status: o?.status };
  }
  const r = await applyCapture({ id: id.payment, order_id: id.order, amount: order.total_paise, method: input.method, status: 'captured' }, userId);
  await writeAudit({ userId, action: 'demo_payment_captured', performedBy: userId,
    newValue: { demo: true, order_id: order.id, gateway_order_id: id.order, gateway_payment_id: id.payment, method: input.method,
      ...via(input), amount_paise: order.total_paise, outcome: r.outcome } });
  const o = await queryOne<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
  return { order_id: order.id, paid: true, demo: true, payment_id: id.payment, status: o?.status };
}

export async function payConsultationDemo(userId: string, consultationId: string, input: DemoPaymentInput) {
  assertDemoPayments();
  const id = ids();
  const c = await withTransaction(async (client) => {
    const row = (await client.query(`SELECT id, status, payment_status, fee_paise FROM consultations WHERE id = $1 AND patient_user_id = $2 FOR UPDATE`,
      [consultationId, userId])).rows[0];
    if (!row) throw new AppError('Consultation not found', 404);
    if (row.status !== 'booked' || row.payment_status !== 'unpaid') throw new AppError('Nothing to pay for this consultation', 409);
    await client.query(`UPDATE consultations SET gateway_order_id = $2 WHERE id = $1`, [consultationId, id.order]);
    return row;
  });
  if (input.outcome === 'failure') {
    await writeAudit({ userId, action: 'demo_payment_failed', performedBy: userId,
      newValue: { demo: true, consultation_id: consultationId, gateway_order_id: id.order, method: input.method, ...via(input), amount_paise: c.fee_paise } });
    return { id: consultationId, paid: false, demo: true, payment_status: 'unpaid' };
  }
  await applyCapture({ id: id.payment, order_id: id.order, amount: Number(c.fee_paise), method: input.method, status: 'captured' }, userId);
  await writeAudit({ userId, action: 'demo_payment_captured', performedBy: userId,
    newValue: { demo: true, consultation_id: consultationId, gateway_order_id: id.order, gateway_payment_id: id.payment, method: input.method, ...via(input), amount_paise: c.fee_paise } });
  const now = await queryOne<{ payment_status: string }>(`SELECT payment_status FROM consultations WHERE id = $1`, [consultationId]);
  return { id: consultationId, paid: now?.payment_status === 'paid', demo: true, payment_status: now?.payment_status };
}
