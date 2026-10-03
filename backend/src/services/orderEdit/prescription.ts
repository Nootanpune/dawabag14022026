// A prescription for medicines a buyer adds (or raises) before the invoice (Sprint 44; owner
// decision CONFIRMED 2026-10-03: "any new prescription drug added requires a valid
// prescription"; Rulebook C-08). Accepted, as at checkout (Sprint 39):
//   • the prescription already sent with this order and not yet checked (the pharmacist checks
//     it against everything now on the order),
//   • a new upload not yet with any order — attached to this order, or
//   • a saved prescription our pharmacist verified, still valid and with enough left for every
//     prescription line now waiting — offered to the pharmacist to apply.
// Either way the order goes back to the pharmacist's prescription check (status rx_pending).
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { rxRequiredLines } from '../rxGate.service';
import { prescriptionRequiredError } from '../prescriptions/requirement.service';

export async function prescriptionForEditTx(client: PoolClient, userId: string, orderId: string,
  prescriptionId: string | undefined, newRxNames: string[]): Promise<{ id: string; status: string; how: 'attached' | 'with_order' | 'saved_verified' }> {
  if (!prescriptionId) throw prescriptionRequiredError(newRxNames);
  const rx = (await client.query(
    `SELECT id, status, valid_until, order_id FROM prescriptions WHERE id = $1 AND user_id = $2 FOR UPDATE`, [prescriptionId, userId])).rows[0];
  if (!rx) throw new AppError('Prescription not found', 404);
  if (rx.status === 'pending') {
    if (rx.order_id && rx.order_id !== orderId) throw new AppError('This prescription is already with another order', 409);
    if (!rx.order_id) await client.query(`UPDATE prescriptions SET order_id = $2 WHERE id = $1 AND order_id IS NULL`, [prescriptionId, orderId]);
    await writeAuditTx(client, { userId, action: 'prescription_attached_to_order', performedBy: userId,
      newValue: { order_id: orderId, prescription_id: prescriptionId, for: 'order_change' } });
    return { id: prescriptionId, status: 'pending', how: rx.order_id ? 'with_order' : 'attached' };
  }
  if (rx.status !== 'verified') throw new AppError('Only a prescription our pharmacist has verified, or a new one, can be used', 400);
  if (!rx.valid_until || new Date(rx.valid_until) < new Date(new Date().toDateString())) throw new AppError('This prescription has expired', 400);
  const waiting = (await rxRequiredLines(client, orderId)).filter((l) => !l.prescription_id);
  const left = new Map((await client.query(
    `SELECT product_id, remaining_qty AS left FROM prescription_item_balances WHERE prescription_id = $1`, [prescriptionId]))
    .rows.map((r: any) => [r.product_id, Number(r.left)]));
  const need = new Map<string, { name: string; qty: number }>();
  for (const l of waiting) {
    const n = need.get(l.product_id) ?? { name: l.product_name, qty: 0 };
    n.qty += l.quantity;
    need.set(l.product_id, n);
  }
  const short = [...need.entries()].filter(([id, n]) => (left.get(id) ?? 0) < n.qty).map(([, n]) => n.name);
  if (short.length) throw new AppError(`This prescription does not cover: ${short.join(', ')}`, 400);
  await client.query(`UPDATE orders SET requested_prescription_id = $2, updated_at = NOW() WHERE id = $1`, [orderId, prescriptionId]);
  await writeAuditTx(client, { userId, action: 'prescription_reuse_requested', performedBy: userId,
    newValue: { order_id: orderId, prescription_id: prescriptionId, for: 'order_change' } });
  return { id: prescriptionId, status: 'verified', how: 'saved_verified' };
}
