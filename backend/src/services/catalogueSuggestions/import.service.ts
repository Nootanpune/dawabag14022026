// Sprint 46 — import catalogue suggestions for ONE partner's DRAFT products (owner
// request 2026-10-04: bring the partner's new products in faster, still decided by a
// pharmacist). One transaction per file:
//   • each row is matched through the chosen partner's own item links, exactly as the
//     Sprint 45 drafts import does (loadDraftMatcher / matchDraftRow = the partner stock
//     import's matcher); only an item linked to a DRAFT product (Sprint 29) takes a
//     suggestion — a live product is never changed ("already in catalogue");
//   • an unmatched row is "no draft yet" (CSV); when the partner has an open request for
//     that item, its id is returned so an admin can create the draft first (Sprint 29);
//   • the suggestion is stored on its own (catalogue_draft_suggestions, immutable, with
//     confidence, note and who imported it) — never written into the product's decided
//     fields. The pharmacist sees it on the form, saves what they decide and approves each
//     product one at a time (C-10, C-19, C-25);
//   • a category / HSN code not in the managed lists is kept and flagged (Sprint 31);
//   • re-importing adds a new suggestion only while the draft is still open, and only
//     when something changed;
//   • one audit entry per import: who, which partner, the counts (C-46).
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { toCsv } from '../../utils/csv';
import { partnerOf } from '../medicineInfo/importDrafts/import.service';
import { loadDraftMatcher, matchDraftRow, NOT_IN_CATALOGUE } from '../medicineInfo/importDrafts/match';
import { parseSuggestionRows, SuggestionRow, SuggestionSheetError } from './sheet';
import { readSuggestionWorkbook } from './workbook';
import { checkAgainstLists, Lists, SuggestionFlag } from './lists';

export type { SuggestionFlag };

export type SuggestionOutcome = 'attached' | 'replaced' | 'unchanged' | 'already_in_catalogue' | 'no_draft_yet' | 'invalid';
export const SUGGESTION_OUTCOMES: SuggestionOutcome[] = ['attached', 'replaced', 'unchanged', 'already_in_catalogue', 'no_draft_yet', 'invalid'];


export interface SuggestionRowResult {
  row: number;
  item_name: string;
  pack: string | null;
  company: string | null;
  outcome: SuggestionOutcome;
  message: string | null;
  product_id: string | null;
  product_name: string | null;
  confidence: string | null;
  flags: SuggestionFlag[];
  /** An open request of this partner for the item (no draft yet): an admin can create its draft first */
  request_id: string | null;
}

export interface SuggestionImportResult {
  partner: { id: string; name: string };
  file_name: string;
  rows: number;
  counts: Record<SuggestionOutcome, number> & { flagged: number };
  results: SuggestionRowResult[];
  /** The partner's open requests behind "no draft yet" rows (Create drafts for exactly these, Sprint 29) */
  open_request_ids: string[];
  /** The rows with no draft yet, as CSV (built here; the browser only saves it) */
  no_draft_csv: string;
}

export const NO_DRAFT_HINT = 'No draft product yet for this partner item: an admin should first use "Create drafts" on the partner\'s stock-file requests, then import again';

async function loadLists(c: PoolClient): Promise<Lists> {
  const [cats, hsn] = await Promise.all([
    c.query<{ name_key: string; name: string; active: boolean }>(
      `SELECT c.name_key, COALESCE(t.name, c.name) AS name, COALESCE(t.is_active, c.is_active) AS active
         FROM product_categories c LEFT JOIN product_categories t ON t.id = c.merged_into`),
    c.query<{ code: string; target: string; active: boolean; gst_rate: string | null }>(
      `SELECT h.code, COALESCE(t.code, h.code) AS target, COALESCE(t.is_active, h.is_active) AS active, COALESCE(t.gst_rate, h.gst_rate) AS gst_rate
         FROM hsn_codes h LEFT JOIN hsn_codes t ON t.code = h.merged_into`),
  ]);
  return {
    categories: new Map(cats.rows.map((r) => [r.name_key, { name: r.name, active: r.active }])),
    hsn: new Map(hsn.rows.map((r) => [r.code, { name: r.target, active: r.active, gst_rate: r.gst_rate === null ? null : Number(r.gst_rate) }])),
  };
}

async function attachTx(c: PoolClient, r: SuggestionRow, productId: string, partnerId: string, userId: string,
  file: { importId: string; sha256: string; name: string }, lists: Lists): Promise<Pick<SuggestionRowResult, 'outcome' | 'message' | 'product_name' | 'flags'>> {
  // Only an OPEN draft takes a suggestion; a decided product is never touched (C-19)
  const d = (await c.query<{ name: string; catalogue_state: string; status: string }>(
    `SELECT p.name, p.catalogue_state, d.status FROM catalogue_drafts d JOIN products p ON p.id = d.product_id
      WHERE d.product_id = $1 AND p.deleted_at IS NULL FOR UPDATE OF d`, [productId])).rows[0];
  if (!d) return { outcome: 'no_draft_yet', message: NO_DRAFT_HINT, product_name: null, flags: [] };
  if (d.status !== 'open' || d.catalogue_state !== 'draft') {
    return { outcome: 'already_in_catalogue', message: 'Already decided by a pharmacist: the suggestion was not used', product_name: d.name, flags: [] };
  }
  const { suggested, flags } = checkAgainstLists(r.suggested, lists);
  const latest = (await c.query<{ same: boolean }>(
    `SELECT (suggested = $2::jsonb AND confidence = $3 AND note IS NOT DISTINCT FROM $4) AS same
       FROM catalogue_draft_suggestions WHERE product_id = $1 ORDER BY imported_at DESC, id DESC LIMIT 1`,
    [productId, JSON.stringify(suggested), r.confidence, r.note])).rows[0];
  if (latest?.same) return { outcome: 'unchanged', message: 'Same suggestion already imported', product_name: d.name, flags };
  await c.query(
    `INSERT INTO catalogue_draft_suggestions (product_id, partner_id, import_id, row_number, item_name, pack, company, suggested, flags,
                                              confidence, note, file_name, file_sha256, imported_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [productId, partnerId, file.importId, r.rowNumber, r.item_name.slice(0, 500), r.pack, r.company, JSON.stringify(suggested),
     JSON.stringify(flags), r.confidence, r.note, file.name.slice(0, 255), file.sha256, userId]);
  return { outcome: latest ? 'replaced' : 'attached', message: latest ? 'Earlier suggestion replaced' : null, product_name: d.name, flags };
}

export async function importSuggestions(userId: string, partnerId: string, file: { buffer: Buffer; originalname: string }): Promise<SuggestionImportResult> {
  const partner = await partnerOf(partnerId);
  let parsed: SuggestionRow[];
  try { parsed = parseSuggestionRows(await readSuggestionWorkbook(file.buffer)); } catch (e) {
    if (e instanceof SuggestionSheetError) throw new AppError(e.message, 422);
    throw e;
  }
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const importId = crypto.randomUUID();
  return withTransaction(async (c) => {
    const [matcher, lists] = await Promise.all([loadDraftMatcher(c, partnerId), loadLists(c)]);
    const results: SuggestionRowResult[] = [];
    const productRow = new Map<string, number>();
    const noDraftKeys = new Map<string, SuggestionRowResult>();
    for (const r of parsed) {
      const res: SuggestionRowResult = { row: r.rowNumber, item_name: r.item_name, pack: r.pack, company: r.company, outcome: 'invalid',
        message: null, product_id: null, product_name: null, confidence: r.confidence, flags: [], request_id: null };
      results.push(res);
      if (r.problems.length) { res.message = r.problems.join('; '); continue; }
      const m = matchDraftRow(r, matcher);
      if (m.productId && m.how !== 'draft_link') {
        // The partner's item is a LIVE product: the import never changes it
        res.outcome = 'already_in_catalogue';
        res.product_id = m.productId;
        res.product_name = matcher.ctx.products.get(m.productId)?.name ?? null;
        res.message = 'Already in the catalogue: live products are not changed by suggestions';
        continue;
      }
      if (!m.productId) {
        res.outcome = 'no_draft_yet';
        // A name that matches a live product the partner has no link to keeps the matcher's own words
        res.message = m.reason && m.reason !== NOT_IN_CATALOGUE ? m.reason : NO_DRAFT_HINT;
        if (r.item_key) noDraftKeys.set(r.item_key, res);
        continue;
      }
      res.product_id = m.productId;
      const earlier = productRow.get(m.productId);
      if (earlier) { res.message = `Row ${earlier} is for the same draft product`; continue; }
      productRow.set(m.productId, r.rowNumber);
      Object.assign(res, await attachTx(c, r, m.productId, partnerId, userId, { importId, sha256, name: file.originalname }, lists));
    }
    // The partner's open requests behind "no draft yet" rows (Sprint 29 "Create drafts" for exactly these)
    if (noDraftKeys.size) {
      const { rows } = await c.query<{ id: string; item_key: string }>(
        `SELECT id, item_key FROM partner_product_requests WHERE partner_id = $1 AND status = 'open' AND item_key = ANY($2::text[])`,
        [partnerId, [...noDraftKeys.keys()]]);
      for (const q of rows) {
        const res = noDraftKeys.get(q.item_key);
        if (res) { res.request_id = q.id; res.message = 'The partner asked for this item but it has no draft product yet: create its draft first, then import again'; }
      }
    }
    const counts = Object.fromEntries(SUGGESTION_OUTCOMES.map((o) => [o, results.filter((x) => x.outcome === o).length])) as SuggestionImportResult['counts'];
    counts.flagged = results.filter((x) => x.flags.length).length;
    // C-46: who imported which file for which partner, and what came of it
    await writeAuditTx(c, { userId: null, action: 'catalogue_suggestions_imported', performedBy: userId,
      newValue: { vendor_id: partnerId, partner_name: partner.name, import_id: importId, file_name: file.originalname.slice(0, 255),
        file_sha256: sha256, rows: parsed.length, ...counts,
        product_ids: results.filter((x) => x.outcome === 'attached' || x.outcome === 'replaced').map((x) => x.product_id) } });
    const missing = results.filter((x) => x.outcome === 'no_draft_yet');
    return {
      partner, file_name: file.originalname, rows: parsed.length, counts, results,
      open_request_ids: missing.map((x) => x.request_id).filter((x): x is string => !!x),
      no_draft_csv: toCsv(['row', 'item_name', 'pack', 'company', 'open_request', 'reason'],
        missing.map((x) => ({ row: x.row, item_name: x.item_name, pack: x.pack, company: x.company, open_request: x.request_id ? 'yes' : 'no', reason: x.message }))),
    };
  });
}
