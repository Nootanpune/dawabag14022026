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
import { assertWrittenOrderOnOrder } from '../practitionerSales/writtenOrder.service';
import { assertPrescriptionProvided } from '../prescriptions/requirement.service';
import { needsManualCapture, recordAuthorisation } from './rxHold/hold.service';
import { HOLD_WORDING } from './rxHold/rules';
import { editPaymentTarget } from '../orderEdit/extraPayment';

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

/** Sprint 44: the difference for an order change, paid in the trial's demo (held for an order with prescription medicines). */
export async function payEditDemo(userId: string, orderId: string, orderEditId: string, input: DemoPaymentInput) {
  assertDemoPayments();
  const t = await editPaymentTarget(userId, orderId, orderEditId);
  await assertOrderPayable(pool, orderId);
  const manual = await withTransaction((c) => needsManualCapture(c, orderId));
  const id = ids();
  await query(`INSERT INTO payments (order_id, gateway, gateway_order_id, status, amount_paise, method, capture_mode, order_edit_id)
               VALUES ($1, 'demo', $2, 'created', $3, $4, $5, $6)`, [orderId, id.order, t.amountPaise, input.method, manual ? 'manual' : 'automatic', orderEditId]);
  if (input.outcome === 'failure') {
    await paymentFailed({ order_id: id.order });
    return { order_id: orderId, order_edit_id: orderEditId, paid: false, demo: true };
  }
  const outcome = manual
    ? (await recordAuthorisation({ id: id.payment, order_id: id.order, amount: t.amountPaise, method: input.method, status: 'authorized' }, userId))?.outcome
    : (await applyCapture({ id: id.payment, order_id: id.order, amount: t.amountPaise, method: input.method, status: 'captured' }, userId)).outcome;
  await writeAudit({ userId, action: manual ? 'demo_payment_authorised' : 'demo_payment_captured', performedBy: userId,
    newValue: { demo: true, order_id: orderId, order_edit_id: orderEditId, gateway_order_id: id.order, gateway_payment_id: id.payment,
      method: input.method, ...via(input), amount_paise: t.amountPaise, outcome } });
  return { order_id: orderId, order_edit_id: orderEditId, paid: true, demo: true, payment_id: id.payment,
    payment_status: manual ? 'authorized' as const : 'captured' as const, ...(manual ? { charge_note: HOLD_WORDING.checkout } : {}) };
}

export async function payOrderDemo(userId: string, orderId: string, input: DemoPaymentInput) {
  assertDemoPayments();
  const order = await queryOne<{ id: string; order_number: string; total_paise: number; status: string; user_id: string }>(
    'SELECT id, order_number, total_paise, status, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL', [orderId]);
  if (!order || order.user_id !== userId) throw new AppError('Order not found', 404);
  if (!['pending_payment', 'payment_failed'].includes(order.status)) throw new AppError('This order is already paid or closed', 409);
  if (order.total_paise <= 0) throw new AppError('Nothing to pay on this order', 400);
  await assertOrderPayable(pool, order.id);   // emergency stop (Sprint 38, C-08)
  // Sprint 39: prescription before payment, and a prescription order is only authorised
  // (simulated) until the pharmacist check passes — exactly as with Razorpay (C-08, C-37)
  const manual = await withTransaction(async (c) => {
    await assertPrescriptionProvided(c, order.id);
    // Sprint 44: a doctor / institution order is paid for only with its signed written order (r.65(9)(b))
    await assertWrittenOrderOnOrder(c, order.id);
    return needsManualCapture(c, order.id);
  });

  const id = ids();
  await query(`INSERT INTO payments (order_id, gateway, gateway_order_id, status, amount_paise, method, capture_mode)
               VALUES ($1, 'demo', $2, 'created', $3, $4, $5)`, [order.id, id.order, order.total_paise, input.method, manual ? 'manual' : 'automatic']);
  if (input.outcome === 'failure') {
    // As Razorpay's payment.failed webhook does: the payment fails, the order waits for another try
    await paymentFailed({ order_id: id.order });
    await writeAudit({ userId, action: 'demo_payment_failed', performedBy: userId,
      newValue: { demo: true, order_id: order.id, gateway_order_id: id.order, method: input.method, ...via(input), amount_paise: order.total_paise } });
    const o = await queryOne<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
    return { order_id: order.id, paid: false, demo: true, status: o?.status };
  }
  if (manual) {
    const a = await recordAuthorisation({ id: id.payment, order_id: id.order, amount: order.total_paise, method: input.method, status: 'authorized' }, userId);
    await writeAudit({ userId, action: 'demo_payment_authorised', performedBy: userId,
      newValue: { demo: true, order_id: order.id, gateway_order_id: id.order, gateway_payment_id: id.payment, method: input.method,
        ...via(input), amount_paise: order.total_paise, outcome: a?.outcome } });
    const o = await queryOne<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
    return { order_id: order.id, paid: true, demo: true, payment_id: id.payment, status: o?.status,
      payment_status: 'authorized' as const, charge_note: HOLD_WORDING.checkout };
  }
  const r = await applyCapture({ id: id.payment, order_id: id.order, amount: order.total_paise, method: input.method, status: 'captured' }, userId);
  await writeAudit({ userId, action: 'demo_payment_captured', performedBy: userId,
    newValue: { demo: true, order_id: order.id, gateway_order_id: id.order, gateway_payment_id: id.payment, method: input.method,
      ...via(input), amount_paise: order.total_paise, outcome: r.outcome } });
  const o = await queryOne<{ status: string }>('SELECT status FROM orders WHERE id = $1', [order.id]);
  return { order_id: order.id, paid: true, demo: true, payment_id: id.payment, status: o?.status, payment_status: 'captured' as const };
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
