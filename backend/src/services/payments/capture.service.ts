// One place that records money received from Razorpay, whichever way the news
// arrives: the app's checkout verify, the payment.captured webhook, or the
// reconciliation sweep. Idempotent. A captured payment is one of:
//   • a mandate's ₹1 authorisation (registers the token)
//   • a teleconsultation fee
//   • an order payment (checkout or a refill charged on a mandate)
// Money for an order that was cancelled meanwhile goes straight back (C-37).
import { PoolClient } from 'pg';
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
  const pay = (await client.query(`SELECT order_id, amount_paise, status FROM payments WHERE gateway_order_id = $1 FOR UPDATE`, [p.order_id])).rows[0];
  if (!pay) return null;
  if (['captured', 'partially_refunded', 'refunded'].includes(pay.status)) return { kind: 'order', outcome: 'already recorded', orderId: pay.order_id };
  if (Number(p.amount) !== Number(pay.amount_paise)) {
    logger.error(`Captured amount mismatch for gateway order ${p.order_id}`);
    return { kind: 'order', outcome: 'amount mismatch; left for accounts', orderId: pay.order_id };
  }
  await client.query(`UPDATE payments SET status = 'captured', gateway_payment_id = $2, method = $3, paid_at = NOW() WHERE gateway_order_id = $1`,
    [p.order_id, p.id, p.method ?? null]);
  const order = (await client.query('SELECT status, user_id, order_number FROM orders WHERE id = $1 FOR UPDATE', [pay.order_id])).rows[0];
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

export async function applyCapture(p: GatewayPayment, actor: string | null = null): Promise<CaptureOutcome> {
  const r = await withTransaction(async (client) => {
    if (await activateMandateFromCapture(client, p)) return { kind: 'mandate' as const, outcome: p.token_id ? 'mandate authorised' : 'authorisation without token' };
    return (await captureConsultation(client, p)) ?? (await captureOrder(client, p, actor)) ?? { kind: 'unknown' as const, outcome: 'not a Dawabag payment' };
  });
  const extra = r as any;
  if (extra.refundIds?.length) await sendGatewayRefunds(extra.refundIds);
  if (extra.consultRefund) await refundConsultationFee(extra.consultRefund);
  if (extra.notify) await queueNotification(extra.notify);
  return { kind: r.kind, outcome: r.outcome, orderId: extra.orderId };
}
