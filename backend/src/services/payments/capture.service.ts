// One place that records money received from Razorpay, whichever way the news
// arrives: the app's checkout verify, the payment.captured webhook, or the
// reconciliation sweep. Idempotent. A captured payment is one of:
//   • a mandate's ₹1 authorisation (registers the token)
//   • a teleconsultation fee
//   • an order payment (checkout or a refill charged on a mandate)
// Money for an order that was cancelled meanwhile goes straight back (C-37).
import { PoolClient } from 'pg';
import { refundEditsAfterCaptureTx } from '../orderEdit/editRefunds';
import { recordEditCaptureTx } from '../orderEdit/extraPayment';
import { withTransaction } from '../../config/database';
import { logger } from '../../config/logger';
import { writeAuditTx } from '../../utils/audit';
import { activateMandateFromCapture } from '../mandate.service';
import { moveOrderToFulfilment } from '../paymentCapture.service';
import { recordRefund, sendGatewayRefunds } from '../refund.service';
import { queueNotification } from '../notification.service';
import { refundConsultationFee } from '../telemedicine/consultationFee.service';

export interface GatewayPayment { id: string; order_id: string; amount: number; method?: string; token_id?: string; status?: string }
export interface CaptureOutcome { kind: 'mandate' | 'consultation' | 'order' | 'unknown'; outcome: string; orderId?: string }

async function captureConsultation(client: PoolClient, p: GatewayPayment): Promise<(CaptureOutcome & { consultRefund?: string }) | null> {
  const c = (await client.query(`SELECT id, status, patient_user_id, fee_paise, payment_status, gateway_payment_id FROM consultations
                                 WHERE gateway_order_id = $1 FOR UPDATE`, [p.order_id])).rows[0];
  if (!c) return null;
  // Paid, refunding or refunded already: a late or repeated capture changes nothing
  if (c.payment_status !== 'unpaid') return { kind: 'consultation', outcome: `already ${c.payment_status}` };
  if (Number(p.amount) !== Number(c.fee_paise)) {
    logger.error(`Consultation ${c.id}: captured ${p.amount} but the fee is ${c.fee_paise}`);
    return { kind: 'consultation', outcome: 'amount mismatch; left for accounts' };
  }
  if (c.status !== 'booked') {
    // Paid after it was cancelled: the money goes straight back (C-37)
    await client.query(`UPDATE consultations SET payment_status = 'refund_pending', gateway_payment_id = $2, paid_at = NOW() WHERE id = $1`, [c.id, p.id]);
    await writeAuditTx(client, { userId: c.patient_user_id, action: 'consultation_paid_after_cancel', newValue: { consultation_id: c.id, payment_id: p.id } });
    return { kind: 'consultation', outcome: 'consultation already cancelled: refund', consultRefund: c.id };
  }
  await client.query(`UPDATE consultations SET payment_status = 'paid', gateway_payment_id = $2, paid_at = NOW() WHERE id = $1`, [c.id, p.id]);
  await writeAuditTx(client, { userId: c.patient_user_id, action: 'consultation_paid', newValue: { consultation_id: c.id, payment_id: p.id, amount_paise: p.amount } });
  return { kind: 'consultation', outcome: 'consultation paid' };
}

async function captureOrder(client: PoolClient, p: GatewayPayment, actor: string | null): Promise<(CaptureOutcome & { refundIds?: string[]; notify?: any }) | null> {
  const pay = (await client.query(`SELECT order_id, amount_paise, status, order_edit_id FROM payments WHERE gateway_order_id = $1 FOR UPDATE`, [p.order_id])).rows[0];
  if (!pay) return null;
  if (['captured', 'partially_refunded', 'refunded'].includes(pay.status)) return { kind: 'order', outcome: 'already recorded', orderId: pay.order_id };
  if (Number(p.amount) !== Number(pay.amount_paise)) {
    logger.error(`Captured amount mismatch for gateway order ${p.order_id}`);
    return { kind: 'order', outcome: 'amount mismatch; left for accounts', orderId: pay.order_id };
  }
  // Sprint 44: the second payment for an order change (orderEdit/extraPayment.ts)
  if (pay.order_edit_id) return captureEditPayment(client, p, pay, actor);
  // Sprint 39: a prescription order's authorisation, captured after the pharmacist check
  const held = pay.status === 'authorized' || pay.status === 'released';
  await client.query(`UPDATE payments SET status = 'captured', gateway_payment_id = $2, method = COALESCE($3, method), paid_at = NOW(), captured_at = NOW(),
                        capture_failure = NULL WHERE gateway_order_id = $1`,
    [p.order_id, p.id, p.method ?? null]);
  const order = (await client.query('SELECT status, user_id, order_number FROM orders WHERE id = $1 FOR UPDATE', [pay.order_id])).rows[0];
  if (held) {
    // Captured although the hold had been released or the order closed (a capture that
    // crossed a cancellation): the money goes straight back (C-37)
    if (pay.status === 'released' || order.status === 'cancelled') {
      const back = await recordRefund(client, { orderId: pay.order_id, amountPaise: Number(p.amount), source: 'cancellation', userId: null });
      await writeAuditTx(client, { userId: order.user_id, action: 'payment_after_close_refunded', performedBy: actor,
        newValue: { order_id: pay.order_id, order_status: order.status, gateway_payment_id: p.id, held_payment: true } });
      return { kind: 'order', outcome: 'held payment captured after release: refunded', orderId: pay.order_id, refundIds: back.gatewayRefundIds };
    }
    await writeAuditTx(client, { userId: order.user_id, action: 'payment_captured', performedBy: actor,
      newValue: { order_id: pay.order_id, gateway_order_id: p.order_id, gateway_payment_id: p.id, order_status: order.status,
        after_pharmacist_check: true, ...(String(p.id).startsWith('demo_') ? { demo: true } : {}) } });
    // Sprint 43: the authorised amount is captured in full; what the buyer took off the order
    // while it was held goes back now (order changes before packing, C-37)
    const editRefunds = await refundEditsAfterCaptureTx(client, pay.order_id);
    return { kind: 'order', outcome: 'held payment captured after the pharmacist check', orderId: pay.order_id, refundIds: editRefunds,
      notify: { userId: order.user_id, type: 'payment_confirmed', orderId: pay.order_id, orderNumber: order.order_number, status: order.status } };
  }
  if (!['pending_payment', 'payment_failed'].includes(order.status)) {
    const back = await recordRefund(client, { orderId: pay.order_id, amountPaise: Number(p.amount), source: 'cancellation', userId: null });
    await writeAuditTx(client, { userId: order.user_id, action: 'payment_after_close_refunded', performedBy: actor,
      newValue: { order_id: pay.order_id, order_status: order.status, gateway_payment_id: p.id } });
    return { kind: 'order', outcome: 'order already closed: refunded', orderId: pay.order_id, refundIds: back.gatewayRefundIds };
  }
  const status = await moveOrderToFulfilment(client, pay.order_id);
  await writeAuditTx(client, { userId: order.user_id, action: 'payment_captured', performedBy: actor,
    newValue: { order_id: pay.order_id, gateway_order_id: p.order_id, gateway_payment_id: p.id, order_status: status } });
  return { kind: 'order', outcome: `order paid → ${status}`, orderId: pay.order_id,
    notify: { userId: order.user_id, type: 'payment_confirmed', orderId: pay.order_id, orderNumber: order.order_number, status } };
}

async function captureEditPayment(client: PoolClient, p: GatewayPayment, pay: { order_id: string; status: string; order_edit_id: string },
  actor: string | null): Promise<CaptureOutcome & { refundIds?: string[] }> {
  await client.query(`UPDATE payments SET status = 'captured', gateway_payment_id = $2, method = COALESCE($3, method), paid_at = NOW(), captured_at = NOW(),
                        capture_failure = NULL WHERE gateway_order_id = $1`, [p.order_id, p.id, p.method ?? null]);
  const r = pay.status === 'released' ? 'refund' : await recordEditCaptureTx(client, pay, p.id, actor);
  if (r === 'refund') {
    // Paid for a change no longer owed (or after its hold was released): straight back (C-37)
    const back = await recordRefund(client, { orderId: pay.order_id, amountPaise: Number(p.amount), source: 'order_edit', userId: null,
      preferGatewayPaymentId: p.id });
    return { kind: 'order', outcome: 'order change no longer owed: refunded', orderId: pay.order_id, refundIds: back.gatewayRefundIds };
  }
  // The last held payment of the order captured: what changes took off goes back now (Sprint 43)
  const editRefunds = await refundEditsAfterCaptureTx(client, pay.order_id);
  return { kind: 'order', outcome: 'order change payment captured', orderId: pay.order_id, refundIds: editRefunds };
}

/** What applyCaptureTx leaves for after the commit (gateway refunds, notifications). */
export type CaptureRecord = CaptureOutcome & { refundIds?: string[]; consultRefund?: string; notify?: any };

/** Records a capture inside the caller's transaction (Sprint 41: the held-payment capture records it under the order lock). */
export async function applyCaptureTx(client: PoolClient, p: GatewayPayment, actor: string | null = null): Promise<CaptureRecord> {
  if (await activateMandateFromCapture(client, p)) return { kind: 'mandate' as const, outcome: p.token_id ? 'mandate authorised' : 'authorisation without token' };
  return (await captureConsultation(client, p)) ?? (await captureOrder(client, p, actor)) ?? { kind: 'unknown' as const, outcome: 'not a Dawabag payment' };
}

/** After the transaction committed: refunds to the gateway and the buyer's notification. */
export async function afterCapture(r: CaptureRecord): Promise<CaptureOutcome> {
  if (r.refundIds?.length) await sendGatewayRefunds(r.refundIds);
  if (r.consultRefund) await refundConsultationFee(r.consultRefund);
  if (r.notify) await queueNotification(r.notify);
  return { kind: r.kind, outcome: r.outcome, orderId: r.orderId };
}

export async function applyCapture(p: GatewayPayment, actor: string | null = null): Promise<CaptureOutcome> {
  return afterCapture(await withTransaction((client) => applyCaptureTx(client, p, actor)));
}
