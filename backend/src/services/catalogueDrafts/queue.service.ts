// Sprint 29 — the pharmacist's "New products to complete" queue: list with
// filters and a progress count, save-as-you-go of one draft's fields, and bulk
// setting of NON-clinical fields only (category, HSN, manufacturer declarations).
// The schedule and every clinical detail are set one product at a time.
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { cacheDel } from '../../config/redis';
import { requireCategory, requireHsn } from '../catalogueLists/lists.service';
import { changeLiveCopyTx } from '../productContent.service';
import { approvalProblems, draftWarnings, prescriptionFor, suggestedDescription, DOSAGE_FORMS, GST_RATES, SCHEDULES } from './rules';

/** Fields a person may save on a draft (all optional; null clears). */
export const DRAFT_FIELDS = [
  'name', 'generic_name', 'composition', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain', 'schedule_c_c1', 'hsn_code', 'gst_rate',
  'category', 'description', 'storage_instructions', 'net_quantity', 'marketed_by', 'manufacturer_name',
  'manufacturer_address', 'country_of_origin',
] as const;
export type DraftField = typeof DRAFT_FIELDS[number];

/** The only fields "set for all selected" may touch — never the schedule or anything clinical. */
export const BULK_FIELDS = ['category', 'hsn_code', 'manufacturer_name', 'manufacturer_address', 'country_of_origin'] as const;
export type BulkField = typeof BULK_FIELDS[number];

const COLUMNS = `p.id, p.sku, p.name, p.generic_name, p.composition, p.strength, p.dosage_form, p.drug_schedule, p.cold_chain, p.schedule_c_c1,
  p.hsn_code, p.gst_rate, p.category, p.description, p.storage_instructions, p.net_quantity, p.marketed_by,
  p.manufacturer_name, p.manufacturer_address, p.country_of_origin, p.mrp_paise, p.catalogue_state, p.content_status,
  d.from_file, d.cold_chain_decided, d.status, d.created_at, d.updated_at, d.decided_at, d.decision_note,
  up.full_name AS decided_by_name, h.gst_rate AS hsn_gst_rate, h.description AS hsn_description`;
const FROM = `FROM catalogue_drafts d JOIN products p ON p.id = d.product_id LEFT JOIN user_profiles up ON up.user_id = d.decided_by
  LEFT JOIN hsn_codes h ON h.code = p.hsn_code`;

function view(r: any) {
  const fields = { ...r, gst_rate: r.gst_rate === null ? null : Number(r.gst_rate) };
  const open = r.status === 'open';
  return {
    ...fields,
    requires_prescription: prescriptionFor(r.drug_schedule),
    problems: open ? approvalProblems(fields, r.cold_chain_decided) : [],
    warnings: open ? draftWarnings(fields) : [],
    suggested_description: open ? suggestedDescription(fields) : null,
  };
}
export type DraftView = ReturnType<typeof view>;

export interface DraftFilters {
  status: 'open' | 'done' | 'all';
  company?: string;
  needs_schedule?: boolean;
  cold_chain?: 'yes' | 'no' | 'undecided';
  q?: string;
  page: number;
  limit: number;
}

export async function listDrafts(f: DraftFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.status === 'open') where.push(`d.status = 'open'`);
  if (f.status === 'done') where.push(`d.status <> 'open'`);
  if (f.company) where.push(`d.from_file->>'company' = ${add(f.company)}`);
  if (f.needs_schedule) where.push('p.drug_schedule IS NULL');
  if (f.cold_chain === 'yes') where.push('d.cold_chain_decided AND p.cold_chain');
  if (f.cold_chain === 'no') where.push('d.cold_chain_decided AND NOT p.cold_chain');
  if (f.cold_chain === 'undecided') where.push('NOT d.cold_chain_decided');
  if (f.q) { const k = add(`%${f.q}%`); where.push(`(p.name ILIKE ${k} OR p.generic_name ILIKE ${k} OR d.from_file->>'item_name' ILIKE ${k})`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, total, progress, companies] = await Promise.all([
    query<any>(`SELECT ${COLUMNS} ${FROM} ${w}
                ORDER BY d.from_file->>'company' NULLS LAST, p.name, p.id
                LIMIT ${add(f.limit)} OFFSET ${add((f.page - 1) * f.limit)}`, params),
    queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n ${FROM} ${w}`, params.slice(0, params.length - 2)),
    queryOne<{ done: number; total: number }>(
      `SELECT COUNT(*) FILTER (WHERE status <> 'open')::int AS done, COUNT(*)::int AS total FROM catalogue_drafts`),
    query<{ company: string; n: number }>(
      `SELECT from_file->>'company' AS company, COUNT(*)::int AS n FROM catalogue_drafts
       WHERE status = 'open' AND from_file->>'company' IS NOT NULL GROUP BY 1 ORDER BY 1`),
  ]);
  return {
    drafts: rows.map(view), total: total?.n ?? 0, page: f.page, limit: f.limit,
    progress: { done: progress?.done ?? 0, total: progress?.total ?? 0 }, companies,
  };
}

export async function getDraft(productId: string) {
  const r = await queryOne<any>(`SELECT ${COLUMNS} ${FROM} WHERE d.product_id = $1`, [productId]);
  if (!r) throw new AppError('New product not found', 404);
  return view(r);
}

/** Choices for the queue's fixed pickers. Categories and HSN codes come from their
 *  managed lists (GET /catalogue-lists/categories, /catalogue-lists/hsn-codes, Sprint 31). */
export function draftOptions() {
  return { schedules: SCHEDULES, dosage_forms: DOSAGE_FORMS, gst_rates: GST_RATES };
}

/** Category and HSN must be entries of their lists (spelled as listed); null clears. */
async function checkListed<T extends { category?: unknown; hsn_code?: unknown }>(c: Pick<PoolClient, 'query'>, v: T): Promise<T> {
  const out = { ...v };
  if ('category' in v) out.category = await requireCategory(c, v.category as string | null);
  if ('hsn_code' in v) out.hsn_code = await requireHsn(c, v.hsn_code as string | null);
  return out;
}

/** The open draft, locked for this transaction (409 once decided). */
export async function lockOpenDraft(c: Pick<PoolClient, 'query'>, productId: string) {
  const r = (await c.query<any>(
    `SELECT p.*, d.status AS draft_status, d.cold_chain_decided FROM catalogue_drafts d JOIN products p ON p.id = d.product_id
     WHERE d.product_id = $1 FOR UPDATE OF d, p`, [productId])).rows[0];
  if (!r) throw new AppError('New product not found', 404);
  if (r.draft_status !== 'open' || r.catalogue_state !== 'draft') throw new AppError('This new product has already been decided', 409);
  return r;
}

/** Save as you go: only the fields sent change; the server re-checks what is still missing. */
export async function saveDraft(productId: string, userId: string, sent: Partial<Record<DraftField, unknown>>) {
  const keys = Object.keys(sent) as DraftField[];
  if (!keys.length) throw new AppError('Nothing to save', 400);
  await withTransaction(async (c) => {
    const before = await lockOpenDraft(c, productId);
    const updates = await checkListed(c, sent);
    const changed = keys.filter((k) => (before[k] ?? null) !== (updates[k] ?? null));
    if (changed.length) {
      await c.query(
        `UPDATE products SET ${changed.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
        [productId, ...changed.map((k) => updates[k] ?? null)]);
    }
    await c.query(
      `UPDATE catalogue_drafts SET cold_chain_decided = cold_chain_decided OR $2, updated_by = $3, updated_at = NOW() WHERE product_id = $1`,
      [productId, 'cold_chain' in updates && updates.cold_chain !== null, userId]);
    if (changed.length) {
      // C-46: who set which detail (the schedule decision especially)
      await writeAuditTx(c, { userId: null, action: 'catalogue_draft_saved', performedBy: userId,
        oldValue: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
        newValue: { product_id: productId, ...Object.fromEntries(changed.map((k) => [k, updates[k] ?? null])) } });
    }
  });
  return getDraft(productId);
}

/** "Set for all selected": non-clinical fields only, open drafts only. */
export async function bulkSetDrafts(productIds: string[], userId: string, sent: Partial<Record<BulkField, string | null>>) {
  const keys = (Object.keys(sent) as BulkField[]).filter((k) => (BULK_FIELDS as readonly string[]).includes(k));
  if (!keys.length) throw new AppError('Choose what to set', 400);
  return withTransaction(async (c) => {
    const set = await checkListed(c, sent);
    const { rows } = await c.query<{ id: string }>(
      `UPDATE products p SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW()
       FROM catalogue_drafts d
       WHERE d.product_id = p.id AND d.status = 'open' AND p.catalogue_state = 'draft' AND p.id = ANY($1::uuid[])
       RETURNING p.id`,
      [productIds, ...keys.map((k) => set[k] ?? null)]);
    await c.query(`UPDATE catalogue_drafts SET updated_by = $2, updated_at = NOW() WHERE product_id = ANY($1::uuid[])`,
      [rows.map((r) => r.id), userId]);
    await writeAuditTx(c, { userId: null, action: 'catalogue_drafts_bulk_set', performedBy: userId,
      newValue: { product_ids: rows.map((r) => r.id), ...Object.fromEntries(keys.map((k) => [k, set[k] ?? null])) } });
    return { updated: rows.length };
  });
}

/**
 * The description for buyers, written or changed at any time (Sprint 31): on an open
 * draft it is saved like any detail; on an approved product it is a change to live
 * copy and goes back to the pharmacist's C-19 review ("Product copy") before buyers
 * see it. Never sold online (C-10) or closed products have no buyer copy.
 */
export async function saveDraftDescription(productId: string, userId: string, description: string | null) {
  const d = await queryOne<{ status: string }>('SELECT status FROM catalogue_drafts WHERE product_id = $1', [productId]);
  if (!d) throw new AppError('New product not found', 404);
  if (d.status === 'open') return saveDraft(productId, userId, { description });
  if (d.status !== 'approved') throw new AppError('This product is not sold online, so it has no description for buyers', 409);
  await withTransaction((c) => changeLiveCopyTx(c, userId, productId, { description }));
  await cacheDel(`product:${productId}`);
  return getDraft(productId);
}
