// GDP records per batch (Sprint 40, rules.ts): hand-recorded events by Dawabag's store
// staff (own batches) and by partners (their batches), the "received" record written
// by the goods receipt, and the excursion logged when a cold-chain parcel is refused
// at dispatch. Records are append-only (database trigger gdp_records_final); the batch's
// hold follows from them (trigger gdp_records_after_insert) — C-25, C-34.
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { queueNotification } from '../notification.service';
import { COLD_MAX_C, COLD_MIN_C, EventInput, eventInputProblems, outsideColdRange, receivedStorageCondition } from './rules';

type Q = Pick<PoolClient, 'query'>;
export type BatchRef = { kind: 'own'; id: string } | { kind: 'partner'; id: string };

const RECORD_COLS = `r.id, r.batch_id, r.partner_inventory_id, r.partner_id, r.product_id, r.batch_number, r.event_kind, r.storage_condition,
  r.temperature_c::float AS temperature_c, r.cold_chain, r.location, r.excursion_id, r.disposition, r.justification,
  r.pharmacist_name, r.pharmacist_reg_no, r.stock_adjustment_id, r.source, r.shipment_id, r.notes, r.recorded_at,
  up.full_name AS recorded_by_name`;

interface InsertRecord {
  ref: BatchRef;
  event_kind: string;
  temperature_c?: number | null;
  storage_condition?: string | null;
  location?: string | null;
  notes?: string | null;
  source: 'staff' | 'partner' | 'grn' | 'dispatch' | 'system';
  recorded_by: string | null;
  grn_line_id?: string | null;
  shipment_id?: string | null;
}

export async function insertRecordTx(c: Q, r: InsertRecord) {
  return (await c.query(
    `INSERT INTO gdp_records (batch_id, partner_inventory_id, product_id, batch_number, event_kind, temperature_c, storage_condition,
       location, notes, source, recorded_by, grn_line_id, shipment_id)
     VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', '', $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, event_kind, cold_chain, product_id, batch_number, partner_id, recorded_at`,
    [r.ref.kind === 'own' ? r.ref.id : null, r.ref.kind === 'partner' ? r.ref.id : null, r.event_kind, r.temperature_c ?? null,
     r.storage_condition?.trim() || null, r.location?.trim() || null, r.notes?.trim() || null, r.source, r.recorded_by,
     r.grn_line_id ?? null, r.shipment_id ?? null])).rows[0];
}

/** Product name and batch standing, for messages. */
const factsSql = (ref: BatchRef) => (ref.kind === 'own'
    ? `SELECT ib.id, p.name AS product_name, ib.batch_number, ib.gdp_status, NULL::uuid AS partner_id, NULL AS partner_name
       FROM inventory_batches ib JOIN products p ON p.id = ib.product_id WHERE ib.id = $1`
    : `SELECT pi.id, p.name AS product_name, pi.batch_number, pi.gdp_status, pi.partner_id, v.name AS partner_name
       FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id JOIN products p ON p.id = pp.product_id
       JOIN vendors v ON v.id = pi.partner_id WHERE pi.id = $1`);
type Facts = { id: string; product_name: string; batch_number: string; gdp_status: string; partner_id: string | null; partner_name: string | null };
async function batchFacts(c: Q, ref: BatchRef): Promise<Facts | undefined> {
  return (await c.query(factsSql(ref), [ref.id])).rows[0];
}

/** Pharmacists and admins (Dawabag batch) or the partner's owner logins and Dawabag's admins (partner batch) hear of a cold-chain excursion at once. */
export async function alertExcursion(ref: BatchRef, recordId: string) {
  const f = await queryOne<Facts>(factsSql(ref), [ref.id]);
  if (!f) return;
  const text = `${f.partner_name ? `${f.partner_name}: ` : ''}${f.product_name} batch ${f.batch_number} had a cold-chain excursion and is ON HOLD — `
    + `it is not sold or dispatched until a pharmacist records a disposition (release, quarantine or destroy).`;
  const admins = await query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('admin', 'super_admin'${ref.kind === 'own' ? ", 'pharmacist_rx'" : ''}) AND is_active AND deleted_at IS NULL`);
  for (const a of admins) await queueNotification({ userId: a.id, type: 'gdp_excursion', text, productName: f.product_name, batchNumber: f.batch_number, recordId });
  if (ref.kind === 'partner' && f.partner_id) {
    const owners = await query<{ user_id: string }>(
      `SELECT vu.user_id FROM vendor_users vu JOIN users u ON u.id = vu.user_id WHERE vu.vendor_id = $1 AND vu.is_owner AND u.is_active`, [f.partner_id]);
    for (const o of owners) await queueNotification({ userId: o.user_id, type: 'gdp_excursion', text, productName: f.product_name, batchNumber: f.batch_number, recordId });
  }
}

/** A hand-recorded event (staff: own batches; partner: its own batches — checked by the caller's ref). */
export async function recordEvent(ref: BatchRef, input: EventInput, actor: { id: string; source: 'staff' | 'partner' }) {
  const problems = eventInputProblems(input);
  if (problems.length) throw new AppError(problems.join('; '), 400);
  const rec = await withTransaction(async (c) => {
    const f = await batchFacts(c, ref);
    if (!f) throw new AppError('Batch not found', 404);
    const r = await insertRecordTx(c, { ref, ...input, source: actor.source, recorded_by: actor.id });
    await writeAuditTx(c, { userId: null, action: 'gdp_record_added', performedBy: actor.id,
      newValue: { gdp_record_id: r.id, batch: ref, event_kind: r.event_kind, temperature_c: input.temperature_c ?? null, cold_chain: r.cold_chain } });
    return r;
  });
  if (rec.event_kind === 'excursion' && rec.cold_chain) await alertExcursion(ref, rec.id);
  const after = await queryOne<{ gdp_status: string }>(
    ref.kind === 'own' ? `SELECT gdp_status FROM inventory_batches WHERE id = $1` : `SELECT gdp_status FROM partner_inventory WHERE id = $1`, [ref.id]);
  return { id: rec.id, event_kind: rec.event_kind, cold_chain: rec.cold_chain, recorded_at: rec.recorded_at, batch_gdp_status: after?.gdp_status ?? 'ok',
    converted_to_excursion: rec.event_kind === 'excursion' && input.event_kind === 'temperature_reading' };
}

/** Goods receipt (inside its transaction): every received batch gets its "received" record with the storage condition. */
export async function recordReceivedTx(c: Q, a: { batchId: string; grnLineId: string; grnNumber: string; coldChain: boolean;
  storageInstructions: string | null; userId: string }) {
  await insertRecordTx(c, { ref: { kind: 'own', id: a.batchId }, event_kind: 'received',
    storage_condition: receivedStorageCondition(a.coldChain, a.storageInstructions),
    notes: `Received on ${a.grnNumber}`, source: 'grn', recorded_by: a.userId, grn_line_id: a.grnLineId });
}

/**
 * A cold-chain parcel read outside 2–8 °C at dispatch: the dispatch is still REFUSED
 * (409 COLD_CHAIN_EXCURSION here; handover.service keeps its own hard 409 as the
 * backstop), and before that the reading is logged as an
 * excursion on every cold-chain batch in the shipment — in its own transaction, so the
 * record stays although the dispatch rolls back. The batches are then on hold until a
 * pharmacist decides (C-25). Returns 0 when there is nothing to log; otherwise throws.
 */
export async function logDispatchExcursion(shipmentId: string, seller: { partnerId: string | null }, tempC: number | undefined,
  loggerId: string | undefined, userId: string): Promise<number> {
  if (tempC === undefined || tempC === null || !Number.isFinite(tempC) || !outsideColdRange(tempC)) return 0;
  const s = await queryOne<{ cold_chain: boolean; status: string }>(
    seller.partnerId ? `SELECT cold_chain, status FROM order_shipments WHERE id = $1 AND partner_id = $2`
      : `SELECT cold_chain, status FROM order_shipments WHERE id = $1 AND seller_type = 'dawabag'`,
    seller.partnerId ? [shipmentId, seller.partnerId] : [shipmentId]);
  // Only a parcel actually at the dispatch step (Dawabag: packed; partner: pending / packed)
  const atDispatch = seller.partnerId ? ['pending', 'packed'].includes(s?.status ?? '') : s?.status === 'packed';
  if (!s?.cold_chain || !atDispatch) return 0;
  const lines = await query<{ batch_id: string | null; partner_inv_id: string | null }>(
    `SELECT DISTINCT oi.batch_id, poi.partner_inv_id FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     WHERE oi.shipment_id = $1 AND p.cold_chain`, [shipmentId]);
  const refs: BatchRef[] = lines.map((l) => (l.batch_id ? { kind: 'own' as const, id: l.batch_id }
    : l.partner_inv_id ? { kind: 'partner' as const, id: l.partner_inv_id } : null)).filter(Boolean) as BatchRef[];
  if (!refs.length) return 0;
  const ids = await withTransaction(async (c) => {
    const out: { ref: BatchRef; id: string }[] = [];
    for (const ref of refs) {
      const r = await insertRecordTx(c, { ref, event_kind: 'excursion', temperature_c: tempC, source: 'dispatch', recorded_by: userId, shipment_id: shipmentId,
        notes: `Pack read ${tempC} °C at dispatch (outside ${COLD_MIN_C}–${COLD_MAX_C} °C${loggerId ? `, data logger ${loggerId}` : ''}); dispatch refused` });
      out.push({ ref, id: r.id });
    }
    await writeAuditTx(c, { userId: null, action: 'gdp_dispatch_excursion', performedBy: userId,
      newValue: { shipment_id: shipmentId, temperature_c: tempC, logger_id: loggerId ?? null, records: out.map((o) => o.id) } });
    return out;
  });
  for (const o of ids) await alertExcursion(o.ref, o.id);
  // The same hard refusal as handover.service, now saying what happens next
  throw new AppError(`Pack is at ${tempC} °C; refrigerated items must leave at ${COLD_MIN_C}–${COLD_MAX_C} °C. The excursion is recorded and `
    + `${ids.length === 1 ? 'the batch is' : 'the batches are'} on hold until a pharmacist decides (Staff → GDP excursions, C-25)`, 409, true, 'COLD_CHAIN_EXCURSION');
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface BatchFilter { q?: string; status?: string; partnerId?: string; scope?: 'own' | 'partner' | 'all'; coldOnly?: boolean; limit?: number }

/** Batches with their GDP standing and last record: Dawabag's own and/or partners'. */
export async function listGdpBatches(f: BatchFilter) {
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const q = f.q?.trim() ? add(`%${f.q.trim()}%`) : null;
  const st = f.status ? add(f.status) : null;
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);
  const own = `
    SELECT 'own' AS kind, ib.id, NULL::uuid AS partner_id, NULL::varchar AS partner_name, p.id AS product_id, p.name AS product_name, p.sku,
           ib.batch_number, to_char(ib.expiry_date, 'YYYY-MM-DD') AS expiry_date, ib.storage_location AS location, COALESCE(p.cold_chain, FALSE) AS cold_chain,
           ib.quantity_available AS qty_available, ib.quantity_reserved AS qty_reserved, ib.gdp_status,
           (SELECT MAX(r.recorded_at) FROM gdp_records r WHERE r.batch_id = ib.id) AS last_record_at
    FROM inventory_batches ib JOIN products p ON p.id = ib.product_id
    WHERE (ib.quantity_available > 0 OR ib.gdp_status <> 'ok')
      ${q ? `AND (p.name ILIKE ${q} OR p.sku ILIKE ${q} OR ib.batch_number ILIKE ${q})` : ''}
      ${st ? `AND ib.gdp_status = ${st}` : ''} ${f.coldOnly ? 'AND p.cold_chain' : ''}`;
  const partner = `
    SELECT 'partner' AS kind, pi.id, pi.partner_id, v.name AS partner_name, p.id AS product_id, p.name AS product_name, p.sku,
           pi.batch_number, to_char(pi.expiry_date, 'YYYY-MM-DD') AS expiry_date, pi.storage_location AS location,
           (COALESCE(p.cold_chain, FALSE) OR COALESCE(pi.cold_chain_confirmed, FALSE)) AS cold_chain,
           pi.qty_available, pi.qty_reserved, pi.gdp_status,
           (SELECT MAX(r.recorded_at) FROM gdp_records r WHERE r.partner_inventory_id = pi.id) AS last_record_at
    FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id JOIN products p ON p.id = pp.product_id
    JOIN vendors v ON v.id = pi.partner_id
    WHERE (pi.qty_available > 0 OR pi.gdp_status <> 'ok') ${f.partnerId ? `AND pi.partner_id = ${add(f.partnerId)}` : ''}
      ${q ? `AND (p.name ILIKE ${q} OR p.sku ILIKE ${q} OR pi.batch_number ILIKE ${q})` : ''}
      ${st ? `AND pi.gdp_status = ${st}` : ''} ${f.coldOnly ? 'AND (p.cold_chain OR pi.cold_chain_confirmed)' : ''}`;
  const scope = f.partnerId ? 'partner' : (f.scope ?? 'all');
  const parts = scope === 'own' ? [own] : scope === 'partner' ? [partner] : [own, partner];
  return query<any>(`SELECT * FROM (${parts.join(' UNION ALL ')}) x
    ORDER BY (gdp_status <> 'ok') DESC, cold_chain DESC, product_name, batch_number LIMIT ${limit}`, params);
}

/** One batch's GDP log, oldest first. partnerId set = only that partner's batch (the partner portal). */
export async function batchLog(ref: BatchRef, partnerId?: string) {
  const f = await queryOne<any>(ref.kind === 'own'
    ? `SELECT 'own' AS kind, ib.id, p.name AS product_name, p.sku, ib.batch_number, to_char(ib.expiry_date, 'YYYY-MM-DD') AS expiry_date,
              COALESCE(p.cold_chain, FALSE) AS cold_chain, p.storage_instructions, ib.gdp_status, ib.storage_location AS location,
              ib.quantity_available AS qty_available, ib.quantity_reserved AS qty_reserved, NULL AS partner_name, NULL::uuid AS partner_id
       FROM inventory_batches ib JOIN products p ON p.id = ib.product_id WHERE ib.id = $1`
    : `SELECT 'partner' AS kind, pi.id, p.name AS product_name, p.sku, pi.batch_number, to_char(pi.expiry_date, 'YYYY-MM-DD') AS expiry_date,
              (COALESCE(p.cold_chain, FALSE) OR COALESCE(pi.cold_chain_confirmed, FALSE)) AS cold_chain, p.storage_instructions, pi.gdp_status,
              pi.storage_location AS location, pi.qty_available, pi.qty_reserved, v.name AS partner_name, pi.partner_id
       FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id JOIN products p ON p.id = pp.product_id
       JOIN vendors v ON v.id = pi.partner_id WHERE pi.id = $1`, [ref.id]);
  if (!f || (partnerId && f.partner_id !== partnerId)) throw new AppError('Batch not found', 404);
  const records = await query<any>(
    `SELECT ${RECORD_COLS},
            (r.event_kind = 'excursion' AND NOT EXISTS (SELECT 1 FROM gdp_records d WHERE d.excursion_id = r.id AND d.disposition IN ('release', 'destroy'))) AS open
     FROM gdp_records r LEFT JOIN user_profiles up ON up.user_id = r.recorded_by
     WHERE ${ref.kind === 'own' ? 'r.batch_id' : 'r.partner_inventory_id'} = $1 ORDER BY r.recorded_at, r.id`, [ref.id]);
  return { batch: f, records };
}

/** Excursions waiting for a pharmacist (open = no release / destroy yet; quarantined ones stay listed). */
export async function pendingExcursions(f: { scope?: 'own' | 'partner' | 'all'; partnerId?: string } = {}) {
  const params: unknown[] = [];
  const where = [`r.event_kind = 'excursion'`, 'r.cold_chain',
    `NOT EXISTS (SELECT 1 FROM gdp_records d WHERE d.excursion_id = r.id AND d.disposition IN ('release', 'destroy'))`];
  if (f.partnerId) { params.push(f.partnerId); where.push(`r.partner_id = $${params.length}`); }
  else if (f.scope === 'own') where.push('r.batch_id IS NOT NULL');
  else if (f.scope === 'partner') where.push('r.partner_inventory_id IS NOT NULL');
  return query<any>(
    `SELECT r.id, r.batch_id, r.partner_inventory_id, r.partner_id, v.name AS partner_name, r.product_id, p.name AS product_name, p.sku,
            r.batch_number, r.temperature_c::float AS temperature_c, r.notes, r.source, r.shipment_id, r.recorded_at, up.full_name AS recorded_by_name,
            COALESCE(ib.gdp_status, pi.gdp_status) AS batch_gdp_status,
            COALESCE(ib.quantity_available, pi.qty_available) AS qty_available,
            (SELECT d.disposition FROM gdp_records d WHERE d.excursion_id = r.id ORDER BY d.recorded_at DESC LIMIT 1) AS last_disposition,
            EXTRACT(EPOCH FROM (NOW() - r.recorded_at))::int / 3600 AS hours_waiting
     FROM gdp_records r JOIN products p ON p.id = r.product_id
     LEFT JOIN vendors v ON v.id = r.partner_id
     LEFT JOIN inventory_batches ib ON ib.id = r.batch_id
     LEFT JOIN partner_inventory pi ON pi.id = r.partner_inventory_id
     LEFT JOIN user_profiles up ON up.user_id = r.recorded_by
     WHERE ${where.join(' AND ')} ORDER BY r.recorded_at LIMIT 300`, params);
}
