// src/services/rxReuse.service.ts — a buyer offers a saved, verified prescription
// for a new order (Rulebook C-08). This only flags it for the pharmacist; the
// pharmacist still checks it and applies it (rxVerification.applyPrescriptionToOrder),
// which enforces validity and the quantities left on it.
//
// Sprint 25: a prescription uploaded on its own (the /prescriptions page, no order
// yet) and not yet checked can be picked at checkout too. It is then attached to the
// order exactly as an upload at checkout would be, and the pharmacist checks it with
// the order before anything is dispensed (C-08).
import { PoolClient } from 'pg';
import { withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { rxRequiredLines } from './rxGate.service';

async function lockOpenOrder(client: PoolClient, userId: string, orderId: string) {
  const o = (await client.query(
    `SELECT id, status FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`, [orderId, userId])).rows[0];
  if (!o) throw new AppError('Order not found', 404);
  if (!['pending_payment', 'rx_pending', 'rx_rejected'].includes(o.status)) throw new AppError('This order no longer needs a prescription', 409);
  return o;
}

/** An uploaded, not yet checked prescription with no order: attach it to this order. */
async function attachUnchecked(client: PoolClient, userId: string, prescriptionId: string, orderId: string) {
  await lockOpenOrder(client, userId, orderId);
  const lines = (await rxRequiredLines(client, orderId)).filter((l) => !l.prescription_id);
  if (!lines.length) throw new AppError('This order has no medicines waiting for a prescription', 400);
  await client.query(`UPDATE prescriptions SET order_id = $2 WHERE id = $1 AND order_id IS NULL`, [prescriptionId, orderId]);
  // A fresh prescription for a rejected order puts it back in the pharmacist's queue (as an upload does)
  await client.query(`UPDATE orders SET status = 'rx_pending', updated_at = NOW() WHERE id = $1 AND status = 'rx_rejected'`, [orderId]);
  await writeAuditTx(client, { userId, action: 'prescription_attached_to_order', performedBy: userId,
    newValue: { order_id: orderId, prescription_id: prescriptionId } });
  return { order_id: orderId, prescription_id: prescriptionId, status: 'awaiting_pharmacist' as const };
}

export async function requestPrescriptionReuse(userId: string, prescriptionId: string, orderId: string) {
  return withTransaction(async (client) => {
    const rx = (await client.query(
      `SELECT id, status, valid_until, order_id FROM prescriptions WHERE id = $1 AND user_id = $2 FOR UPDATE`, [prescriptionId, userId])).rows[0];
    if (!rx) throw new AppError('Prescription not found', 404);
    if (rx.status === 'pending' && !rx.order_id) return attachUnchecked(client, userId, prescriptionId, orderId);
    if (rx.status === 'pending') throw new AppError('This prescription is already with another order', 409);
    if (rx.status !== 'verified') throw new AppError('Only a prescription our pharmacist has verified can be reused', 400);
    if (!rx.valid_until || new Date(rx.valid_until) < new Date(new Date().toDateString())) throw new AppError('This prescription has expired', 400);
    await lockOpenOrder(client, userId, orderId);

    // Tell the buyer now if the prescription clearly does not cover the order
    const lines = (await rxRequiredLines(client, orderId)).filter((l) => !l.prescription_id);
    if (!lines.length) throw new AppError('This order has no medicines waiting for a prescription', 400);
    const left = new Map((await client.query(
      `SELECT product_id, prescribed_qty - dispensed_qty AS left FROM prescription_items WHERE prescription_id = $1`, [prescriptionId]))
      .rows.map((r: any) => [r.product_id, Number(r.left)]));
    const short = lines.filter((l) => (left.get(l.product_id) ?? 0) < l.quantity).map((l) => l.product_name);
    if (short.length) throw new AppError(`This prescription does not cover: ${short.join(', ')}`, 400);

    await client.query(
      `UPDATE orders SET requested_prescription_id = $2,
         status = CASE WHEN status = 'rx_rejected' THEN 'rx_pending' ELSE status END, updated_at = NOW()
       WHERE id = $1`, [orderId, prescriptionId]);
    await writeAuditTx(client, { userId, action: 'prescription_reuse_requested', performedBy: userId,
      newValue: { order_id: orderId, prescription_id: prescriptionId } });
    return { order_id: orderId, prescription_id: prescriptionId, status: 'awaiting_pharmacist' };
  });
}
