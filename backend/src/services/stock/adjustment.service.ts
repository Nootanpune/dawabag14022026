// Stock adjustments: every change to stock outside sales and receipts needs a
// reason and a second person's approval (never the requester). Expired, damaged
// and recalled stock written off here forms the destruction register, completed
// when the goods are destroyed (Drugs Rules; C-28, C-34, C-46).
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';

export const REASONS = ['damaged', 'expired', 'recalled', 'count_variance', 'theft_loss', 'found', 'return_to_supplier', 'sample'] as const;
export type Reason = typeof REASONS[number];
const DESTROY = ['damaged', 'expired', 'recalled'];

export async function createAdjustment(client: PoolClient, by: string | null, a: { batch_id: string; quantity_delta: number; reason: Reason; notes: string; stock_count_id?: string }) {
  const b = (await client.query(`SELECT id, quantity_available, quantity_reserved FROM inventory_batches WHERE id = $1`, [a.batch_id])).rows[0];
  if (!b) throw new AppError('Batch not found', 404);
  if (a.reason === 'found' && a.quantity_delta < 0) throw new AppError('"Found" stock must be a positive quantity', 400);
  if (!['found', 'count_variance'].includes(a.reason) && a.quantity_delta > 0) throw new AppError('This reason removes stock: use a negative quantity', 400);
  if (a.quantity_delta < 0 && -a.quantity_delta > b.quantity_available - b.quantity_reserved) {
    throw new AppError(`Only ${b.quantity_available - b.quantity_reserved} unit(s) are free to adjust (the rest are reserved for orders)`, 409);
  }
  const n = (await client.query(`SELECT nextval('stock_adjustment_seq') AS n`)).rows[0].n;
  const no = `ADJ-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
  return (await client.query(
    `INSERT INTO stock_adjustments (adjustment_no, batch_id, quantity_delta, reason, notes, requested_by, stock_count_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, adjustment_no, status`,
    [no, a.batch_id, a.quantity_delta, a.reason, a.notes, by, a.stock_count_id ?? null])).rows[0];
}

export async function requestAdjustment(userId: string, a: { batch_id: string; quantity_delta: number; reason: Reason; notes: string }) {
  return withTransaction(async (client) => {
    const r = await createAdjustment(client, userId, a);
    await writeAuditTx(client, { userId: null, action: 'stock_adjustment_requested', performedBy: userId, newValue: { adjustment_id: r.id, ...a } });
    return r;
  });
}

// Apply under the batch lock; stock never goes below what orders have reserved
export async function applyAdjustment(client: PoolClient, approverId: string, id: string, notes: string) {
  const adj = (await client.query(`SELECT * FROM stock_adjustments WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!adj) throw new AppError('Adjustment not found', 404);
  if (adj.status !== 'requested') throw new AppError(`Adjustment is already ${adj.status}`, 409);
  if (adj.requested_by === approverId) throw new AppError('Someone other than the requester must approve', 403);
  const moved = await client.query(
    `UPDATE inventory_batches SET quantity_available = quantity_available + $2
     WHERE id = $1 AND quantity_available + $2 >= quantity_reserved RETURNING quantity_available`, [adj.batch_id, adj.quantity_delta]);
  if (!moved.rowCount) throw new AppError('Not enough free stock in this batch any more; re-check and raise a new adjustment', 409);
  await client.query(`UPDATE stock_adjustments SET status = 'approved', approved_by = $2, decided_at = NOW(), decision_notes = $3 WHERE id = $1`,
    [id, approverId, notes]);
  await writeAuditTx(client, { userId: null, action: 'stock_adjustment_approved', performedBy: approverId,
    newValue: { adjustment_id: id, batch_id: adj.batch_id, quantity_delta: adj.quantity_delta, reason: adj.reason }, notes });
  return { id, status: 'approved', quantity_available: moved.rows[0].quantity_available };
}

export async function decideAdjustment(approverId: string, id: string, approve: boolean, notes: string) {
  return withTransaction(async (client) => {
    if (approve) return applyAdjustment(client, approverId, id, notes);
    const adj = (await client.query(`SELECT status, requested_by FROM stock_adjustments WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!adj) throw new AppError('Adjustment not found', 404);
    if (adj.status !== 'requested') throw new AppError(`Adjustment is already ${adj.status}`, 409);
    await client.query(`UPDATE stock_adjustments SET status = 'rejected', approved_by = $2, decided_at = NOW(), decision_notes = $3 WHERE id = $1`,
      [id, adj.requested_by === approverId ? null : approverId, notes]);
    await writeAuditTx(client, { userId: null, action: 'stock_adjustment_rejected', performedBy: approverId, newValue: { adjustment_id: id }, notes });
    return { id, status: 'rejected' };
  });
}

export async function recordDisposal(userId: string, id: string, d: { method: 'incineration' | 'authorised_vendor' | 'returned_to_manufacturer'; reference: string; witness: string }) {
  return withTransaction(async (client) => {
    const adj = (await client.query(`SELECT status, reason, disposed_at FROM stock_adjustments WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!adj) throw new AppError('Adjustment not found', 404);
    if (adj.status !== 'approved' || !DESTROY.includes(adj.reason)) throw new AppError('Only approved expired, damaged or recalled write-offs are destroyed', 409);
    if (adj.disposed_at) throw new AppError('Destruction already recorded', 409);
    await client.query(`UPDATE stock_adjustments SET disposal_method = $2, disposal_reference = $3, disposal_witness = $4, disposed_at = NOW() WHERE id = $1`,
      [id, d.method, d.reference, d.witness]);
    await writeAuditTx(client, { userId: null, action: 'stock_destroyed', performedBy: userId, newValue: { adjustment_id: id, ...d } });
    return { id, disposed: true };
  });
}

const LIST = `
  SELECT a.id, a.adjustment_no, a.batch_id, b.batch_number, b.expiry_date, p.name AS product_name, p.sku, p.drug_schedule,
         a.quantity_delta, a.reason, a.notes, a.status, a.created_at, a.decided_at, a.decision_notes,
         a.disposal_method, a.disposal_reference, a.disposal_witness, a.disposed_at,
         a.requested_by, a.approved_by, COALESCE(ru.full_name, 'Expiry watch (system)') AS requested_by_name, au.full_name AS approved_by_name,
         (a.quantity_delta * b.purchase_price_paise)::bigint AS value_paise
  FROM stock_adjustments a JOIN inventory_batches b ON b.id = a.batch_id JOIN products p ON p.id = b.product_id
  LEFT JOIN user_profiles ru ON ru.user_id = a.requested_by LEFT JOIN user_profiles au ON au.user_id = a.approved_by`;

export async function listAdjustments(status?: string) {
  return query(`${LIST} ${status ? 'WHERE a.status = $1' : ''} ORDER BY a.created_at DESC LIMIT 300`, status ? [status] : []);
}

export async function destructionRegister(pending: boolean) {
  return query(`${LIST} WHERE a.status = 'approved' AND a.reason IN ('damaged', 'expired', 'recalled')
                AND a.disposed_at IS ${pending ? '' : 'NOT '}NULL ORDER BY a.decided_at DESC LIMIT 500`);
}
