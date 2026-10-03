// Partner batch provenance (Sprint 39, rules.ts): recorded once per partner batch,
// never changed (database trigger), shown to Dawabag's admin ("who supplied this
// batch?", recall tracing C-28) and to the partner for its own batches.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { getSetting } from '../settings.service';
import { Provenance, sameProvenance } from './rules';

type Q = Pick<PoolClient, 'query'>;

export const PROVENANCE_REQUIRED_KEY = 'partner_stock.provenance_required';

export async function provenanceRequired(db?: Q): Promise<boolean> {
  return (await getSetting<unknown>(PROVENANCE_REQUIRED_KEY, false, db)) === true;
}

const COLS = `supplier_name, supplier_licence_no, supplier_invoice_no, to_char(supplier_invoice_date, 'YYYY-MM-DD') AS supplier_invoice_date`;

/** Recorded provenance of these partner batches, by partner_inventory id. */
export async function recordedProvenance(c: Q, inventoryIds: string[]): Promise<Map<string, Provenance>> {
  if (!inventoryIds.length) return new Map();
  const rows = (await c.query(`SELECT partner_inventory_id AS id, ${COLS} FROM partner_batch_provenance WHERE partner_inventory_id = ANY($1::uuid[])`,
    [inventoryIds])).rows;
  return new Map(rows.map((r: any) => [r.id, r as Provenance]));
}

export type RecordOutcome = 'recorded' | 'unchanged' | 'kept';

/**
 * Records the batch's provenance the first time it arrives. Later different values are
 * NOT applied ('kept': the first record stands, C-34); the same values are 'unchanged'.
 */
export async function recordProvenanceTx(c: Q, r: { partnerId: string; inventoryId: string; provenance: Provenance; source: 'file' | 'feed' | 'portal';
  importId?: string | null; userId?: string | null }): Promise<RecordOutcome> {
  const ins = await c.query(
    `INSERT INTO partner_batch_provenance (partner_inventory_id, partner_id, supplier_name, supplier_licence_no, supplier_invoice_no,
       supplier_invoice_date, source, import_id, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (partner_inventory_id) DO NOTHING RETURNING id`,
    [r.inventoryId, r.partnerId, r.provenance.supplier_name, r.provenance.supplier_licence_no, r.provenance.supplier_invoice_no,
     r.provenance.supplier_invoice_date, r.source, r.importId ?? null, r.userId ?? null]);
  if (ins.rows.length) return 'recorded';
  const before = (await recordedProvenance(c, [r.inventoryId])).get(r.inventoryId);
  return before && sameProvenance(before, r.provenance) ? 'unchanged' : 'kept';
}

export interface ProvenanceFilter { partnerId?: string; productId?: string; batch?: string; q?: string; missingOnly?: boolean; limit?: number }

/** Partner batches with their provenance (admin: any partner; partner: its own via partnerId). */
export async function listProvenance(f: ProvenanceFilter) {
  const params: unknown[] = [];
  const where = ['TRUE'];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.partnerId) where.push(`pi.partner_id = ${add(f.partnerId)}`);
  if (f.productId) where.push(`pp.product_id = ${add(f.productId)}`);
  if (f.batch?.trim()) where.push(`pi.batch_number ILIKE ${add(`%${f.batch.trim()}%`)}`);
  if (f.q?.trim()) {
    const v = add(`%${f.q.trim()}%`);
    where.push(`(p.name ILIKE ${v} OR pb.supplier_name ILIKE ${v} OR pb.supplier_invoice_no ILIKE ${v})`);
  }
  if (f.missingOnly) where.push('pb.id IS NULL');
  return query<any>(
    `SELECT pi.id AS partner_inventory_id, pi.partner_id, v.name AS partner_name, pp.product_id, p.name AS product_name, p.drug_schedule,
            COALESCE(p.cold_chain, FALSE) AS cold_chain, pi.batch_number, to_char(pi.expiry_date, 'YYYY-MM-DD') AS expiry_date,
            pi.qty_available, pi.qty_reserved,
            pb.supplier_name, pb.supplier_licence_no, pb.supplier_invoice_no, to_char(pb.supplier_invoice_date, 'YYYY-MM-DD') AS supplier_invoice_date,
            pb.source AS provenance_source, pb.recorded_at AS provenance_recorded_at
     FROM partner_inventory pi
     JOIN partner_products pp ON pp.id = pi.partner_product_id
     JOIN vendors v ON v.id = pi.partner_id
     LEFT JOIN products p ON p.id = pp.product_id
     LEFT JOIN partner_batch_provenance pb ON pb.partner_inventory_id = pi.id
     WHERE ${where.join(' AND ')}
     ORDER BY v.name, p.name NULLS LAST, pi.expiry_date LIMIT ${add(Math.min(Math.max(f.limit ?? 200, 1), 1000))}`, params);
}

/**
 * Sprint 40: the partner adds the supplier details of one of ITS batches that has none yet
 * (the "Batch suppliers" page). Recorded once, then read-only (C-02, C-34); a batch that
 * already has a record is refused (409) — the first record stands.
 */
export async function addPortalProvenance(partnerId: string, inventoryId: string, provenance: Provenance, userId: string) {
  return withTransaction(async (c) => {
    const pi = (await c.query(`SELECT id FROM partner_inventory WHERE id = $1 AND partner_id = $2 FOR UPDATE`, [inventoryId, partnerId])).rows[0];
    if (!pi) throw new AppError('Batch not found', 404);
    const outcome = await recordProvenanceTx(c, { partnerId, inventoryId, provenance, source: 'portal', userId });
    if (outcome !== 'recorded') throw new AppError('Supplier details for this batch are already recorded and cannot be changed (C-34)', 409, true, 'PROVENANCE_ALREADY_RECORDED');
    await writeAuditTx(c, { userId: null, action: 'partner_batch_provenance_added', performedBy: userId,
      newValue: { partner_id: partnerId, partner_inventory_id: inventoryId, ...provenance } });
    return { partner_inventory_id: inventoryId, recorded: true, ...provenance };
  });
}
