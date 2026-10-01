// Teleconsultation fees through Razorpay (C-37 for refunds). The fee counts as
// paid only once Razorpay has captured it (checked at the gateway, not just the
// checkout signature). Refunds are marked 'refund_pending' in the transaction
// that decides them and confirmed from the gateway, so none is ever lost: a
// failed call is retried by the payment sweep, and an earlier refund that was
// made but whose reply was lost is found and adopted instead of refunding twice.
import { query, queryOne, withTransaction } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { getRazorpay, validCheckoutSignature } from '../razorpay.client';
import { applyCapture } from '../payments/capture.service';

export async function startPayment(userId: string, id: string) {
  return withTransaction(async (client) => {
    // Locked so two taps cannot create two gateway orders and lose one
    const c = (await client.query(`SELECT * FROM consultations WHERE id = $1 AND patient_user_id = $2 FOR UPDATE`, [id, userId])).rows[0];
    if (!c) throw new AppError('Consultation not found', 404);
    if (c.status !== 'booked' || c.payment_status !== 'unpaid') throw new AppError('Nothing to pay for this consultation', 409);
    if (!c.gateway_order_id) {
      const order: any = await getRazorpay().orders.create({ amount: c.fee_paise, currency: 'INR', payment_capture: true,
        receipt: `consult_${String(id).slice(0, 30)}`, notes: { consultation_id: id } } as any);
      await client.query(`UPDATE consultations SET gateway_order_id = $2 WHERE id = $1`, [id, order.id]);
      c.gateway_order_id = order.id;
    }
    return { gateway_order_id: c.gateway_order_id, amount_paise: c.fee_paise, key_id: process.env.RAZORPAY_KEY_ID };
  });
}

export async function confirmPayment(userId: string, id: string, p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const c = await queryOne<any>(`SELECT * FROM consultations WHERE id = $1 AND patient_user_id = $2`, [id, userId]);
  if (!c) throw new AppError('Consultation not found', 404);
  if (c.payment_status === 'paid' && c.gateway_payment_id === p.razorpay_payment_id) return { id, payment_status: 'paid' };
  if (c.gateway_order_id !== p.razorpay_order_id) throw new AppError('Payment does not match this consultation', 400);
  if (!validCheckoutSignature(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature)) throw new AppError('Payment signature is invalid', 400);
  let payment: any = await getRazorpay().payments.fetch(p.razorpay_payment_id);
  if (payment.status === 'authorized') payment = await getRazorpay().payments.capture(p.razorpay_payment_id, Number(payment.amount), 'INR');
  if (payment.status !== 'captured' || payment.order_id !== c.gateway_order_id || Number(payment.amount) !== Number(c.fee_paise)) {
    throw new AppError(`Payment not received (${payment.status})`, 400);
  }
  const r = await applyCapture(payment, userId);
  const now = await queryOne<{ payment_status: string }>(`SELECT payment_status FROM consultations WHERE id = $1`, [id]);
  if (r.outcome.includes('refund')) throw new AppError('This consultation was already cancelled, so the fee is being refunded', 409);
  return { id, payment_status: now!.payment_status };
}

// Sends (or finds) the refund for a consultation marked refund_pending
export async function refundConsultationFee(id: string): Promise<{ id: string; amount_paise: number } | null> {
  const c = await queryOne<any>(`SELECT id, fee_paise, gateway_payment_id, payment_status FROM consultations WHERE id = $1`, [id]);
  if (!c || c.payment_status !== 'refund_pending' || !c.gateway_payment_id) return null;
  try {
    const rzp: any = getRazorpay();
    const earlier = await rzp.payments.fetchMultipleRefund(c.gateway_payment_id).catch(() => ({ items: [] }));
    const refund = (earlier.items ?? []).find((x: any) => x?.notes?.consultation_id === id)
      ?? await rzp.payments.refund(c.gateway_payment_id, { amount: c.fee_paise, notes: { consultation_id: id } });
    await withTransaction(async (client) => {
      const done = await client.query(
        `UPDATE consultations SET payment_status = 'refunded', gateway_refund_id = $2, refund_error = NULL WHERE id = $1 AND payment_status = 'refund_pending' RETURNING patient_user_id`,
        [id, refund.id]);
      if (done.rowCount) await writeAuditTx(client, { userId: done.rows[0].patient_user_id, action: 'consultation_refunded', newValue: { consultation_id: id, refund_id: refund.id, amount_paise: c.fee_paise } });
    });
    return { id: refund.id, amount_paise: c.fee_paise };
  } catch (e: any) {
    const msg = String(e?.error?.description || e?.message || e).slice(0, 500);
    logger.error(`Consultation ${id} refund failed: ${msg}`);
    await query(`UPDATE consultations SET refund_error = $2 WHERE id = $1`, [id, msg]);
    return null;
  }
}

// Payment sweep: retry refunds still pending
export async function retryPendingConsultationRefunds(): Promise<number> {
  const due = await query<{ id: string }>(`SELECT id FROM consultations WHERE payment_status = 'refund_pending' LIMIT 100`);
  let n = 0;
  for (const r of due) if (await refundConsultationFee(r.id)) n++;
  return n;
}
