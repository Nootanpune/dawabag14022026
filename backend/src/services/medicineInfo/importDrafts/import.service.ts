// Sprint 45 — import medicine-information drafts written outside Dawabag for ONE
// partner's products (owner request 2026-10-03). One transaction per file:
//   • each row is matched through the chosen partner's own item links (match.ts);
//   • content_json is held to the editor's schema (content.ts) and claim-checked
//     (claimsCheck, C-17 / C-19) — flags are stored and shown, as in the editor;
//   • a matched product gets a DRAFT version (never pending review, never approved),
//     source 'imported_draft', with the drafter's assumed composition, confidence and
//     note kept for the pharmacist's banner. The importer is NOT an author (author_ids
//     '{}'): the first pharmacist who edits or sends it becomes the author and a SECOND
//     registered pharmacist must approve it (Sprint 36 four eyes, C-19);
//   • an APPROVED version or one WAITING FOR REVIEW is never touched; an open draft is
//     replaced only when the importer asks ("replace unapproved drafts only");
//   • one audit entry per import: who, which partner, the counts — never the words (C-46).
// Buyers see nothing until a second pharmacist approves (publicInfo reads approved only).
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { queryOne, withTransaction } from '../../../config/database';
import { AppError } from '../../../utils/AppError';
import { writeAuditTx } from '../../../utils/audit';
import { toCsv } from '../../../utils/csv';
import { ClaimFlag } from '../../../utils/claimsCheck';
import { infoFlags, submitProblems } from '../content';
import { DraftRow, DraftSheetError, parseDraftRows } from './sheet';
import { readDraftWorkbook } from './workbook';
import { loadDraftMatcher, matchDraftRow } from './match';

export type RowOutcome = 'created' | 'replaced' | 'unchanged' | 'already_has_information' | 'not_in_catalogue' | 'invalid';

export interface ImportRowResult {
  row: number;
  item_name: string;
  pack: string | null;
  company: string | null;
  outcome: RowOutcome;
  message: string | null;
  product_id: string | null;
  product_name: string | null;
  product_state: string | null;
  version: number | null;
  flags: ClaimFlag[];
  /** What still stops it being sent for review (e.g. no reference yet) */
  to_fix: string[];
}

export interface ImportDraftsResult {
  partner: { id: string; name: string };
  file_name: string;
  rows: number;
  counts: Record<RowOutcome, number> & { flagged: number };
  results: ImportRowResult[];
  /** The rows not in the catalogue yet, as CSV (built here; the browser only saves it) */
  not_in_catalogue_csv: string;
}

export interface ImportOptions { replaceDrafts: boolean }

const OUTCOMES: RowOutcome[] = ['created', 'replaced', 'unchanged', 'already_has_information', 'not_in_catalogue', 'invalid'];

/** The partner the drafts are for (a marketplace partner). */
async function partnerOf(partnerId: string) {
  const v = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM vendors WHERE id = $1 AND vendor_type IN ('marketplace_partner', 'both')`, [partnerId]);
  if (!v) throw new AppError('Partner not found', 404);
  return v;
}

const metaOf = (r: DraftRow, userId: string, sha256: string, fileName: string) => ({
  assumed_composition: r.assumed_composition, composition_confidence: r.composition_confidence,
  drafting_note: r.drafting_note, item_name: r.item_name, pack: r.pack, company: r.company,
  imported_by: userId, imported_at: new Date().toISOString(), file_sha256: sha256, file_name: fileName.slice(0, 255),
});

/** Same words (compared as JSON by PostgreSQL) and same drafter's notes: re-importing it changes nothing. */
const sameDraft = (open: any, r: DraftRow) => open.source === 'imported_draft' && open.same_content === true
  && open.import_meta?.assumed_composition === r.assumed_composition
  && open.import_meta?.composition_confidence === r.composition_confidence
  && (open.import_meta?.drafting_note ?? null) === r.drafting_note;

async function writeDraftTx(c: PoolClient, r: DraftRow, productId: string, partnerId: string, userId: string,
  opts: ImportOptions, file: { sha256: string; name: string }): Promise<Pick<ImportRowResult, 'outcome' | 'message' | 'version' | 'product_name' | 'product_state'>> {
  const p = (await c.query<{ name: string; catalogue_state: string }>(
    `SELECT name, catalogue_state FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [productId])).rows[0];
  if (!p) return { outcome: 'not_in_catalogue', message: 'The linked product no longer exists', version: null, product_name: null, product_state: null };
  const base = { product_name: p.name, product_state: p.catalogue_state };
  if (p.catalogue_state === 'rejected' || p.catalogue_state === 'not_listed') {
    return { ...base, outcome: 'not_in_catalogue', message: 'The linked product is not sold online, so it has no medicine information', version: null };
  }
  const versions = (await c.query<any>(
    `SELECT id, version, status, source, import_meta, content = $2::jsonb AS same_content FROM product_info_versions
      WHERE product_id = $1 AND status IN ('approved', 'draft', 'pending_review') FOR UPDATE`, [productId, JSON.stringify(r.content)])).rows;
  const live = versions.find((v) => v.status === 'approved');
  const open = versions.find((v) => v.status === 'draft' || v.status === 'pending_review');
  // Never touch approved or pending-review text (C-19)
  if (live) return { ...base, outcome: 'already_has_information', message: `Already has approved information (version ${live.version})`, version: live.version };
  if (open?.status === 'pending_review') {
    return { ...base, outcome: 'already_has_information', message: `Already has information waiting for a pharmacist's review (version ${open.version})`, version: open.version };
  }
  const content = r.content!;
  const flags = infoFlags(content);
  const meta = metaOf(r, userId, file.sha256, file.name);
  if (open) {
    if (!opts.replaceDrafts) {
      return { ...base, outcome: 'already_has_information',
        message: `Already has a draft (version ${open.version}); tick "replace unapproved drafts only" to replace it`, version: open.version };
    }
    if (sameDraft(open, r)) return { ...base, outcome: 'unchanged', message: 'Same draft already imported', version: open.version };
    // The draft's words are replaced, so whoever wrote them is no longer an author of it (four eyes counts from here)
    await c.query(
      `UPDATE product_info_versions SET content = $2, flags = $3, source = 'imported_draft', import_partner_id = $4, import_meta = $5,
              author_ids = '{}', updated_by = NULL, submitted_by = NULL, submitted_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'draft'`,
      [open.id, JSON.stringify(content), JSON.stringify(flags), partnerId, JSON.stringify(meta)]);
    return { ...base, outcome: 'replaced', message: `Draft version ${open.version} replaced`, version: open.version };
  }
  const next = Number((await c.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM product_info_versions WHERE product_id = $1`, [productId])).rows[0].v);
  // created_by / updated_by stay empty: the importer did not write these words (who imported is in import_meta and the audit)
  await c.query(
    `INSERT INTO product_info_versions (product_id, version, status, content, flags, author_ids, source, import_partner_id, import_meta)
     VALUES ($1, $2, 'draft', $3, $4, '{}', 'imported_draft', $5, $6)`,
    [productId, next, JSON.stringify(content), JSON.stringify(flags), partnerId, JSON.stringify(meta)]);
  return { ...base, outcome: 'created', message: null, version: next };
}

export async function importInfoDrafts(userId: string, partnerId: string, file: { buffer: Buffer; originalname: string },
  opts: ImportOptions): Promise<ImportDraftsResult> {
  const partner = await partnerOf(partnerId);
  let parsed: DraftRow[];
  try { parsed = parseDraftRows(await readDraftWorkbook(file.buffer)).rows; } catch (e) {
    if (e instanceof DraftSheetError) throw new AppError(e.message, 422);
    throw e;
  }
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  return withTransaction(async (c) => {
    const matcher = await loadDraftMatcher(c, partnerId);
    const results: ImportRowResult[] = [];
    const productRow = new Map<string, number>();
    for (const r of parsed) {
      const res: ImportRowResult = { row: r.rowNumber, item_name: r.item_name, pack: r.pack, company: r.company, outcome: 'invalid',
        message: null, product_id: null, product_name: null, product_state: null, version: null, flags: [], to_fix: [] };
      results.push(res);
      if (r.problems.length) { res.message = r.problems.join('; '); continue; }
      const m = matchDraftRow(r, matcher);
      if (!m.productId) { res.outcome = 'not_in_catalogue'; res.message = m.reason; continue; }
      res.product_id = m.productId;
      const earlier = productRow.get(m.productId);
      if (earlier) { res.outcome = 'invalid'; res.message = `Row ${earlier} is for the same Dawabag product`; continue; }
      productRow.set(m.productId, r.rowNumber);
      Object.assign(res, await writeDraftTx(c, r, m.productId, partnerId, userId, opts, { sha256, name: file.originalname }));
      if (res.outcome === 'created' || res.outcome === 'replaced' || res.outcome === 'unchanged') {
        res.flags = infoFlags(r.content!);
        res.to_fix = submitProblems(r.content!);
      }
    }
    const counts = Object.fromEntries(OUTCOMES.map((o) => [o, results.filter((x) => x.outcome === o).length])) as ImportDraftsResult['counts'];
    counts.flagged = results.filter((x) => x.flags.length).length;
    // C-46: who imported which file for which partner, and what came of it — never the words
    await writeAuditTx(c, { userId: null, action: 'product_info_drafts_imported', performedBy: userId,
      newValue: { vendor_id: partnerId, partner_name: partner.name, file_name: file.originalname.slice(0, 255), file_sha256: sha256,
        rows: parsed.length, ...counts, replace_drafts: opts.replaceDrafts,
        product_ids: results.filter((x) => x.outcome === 'created' || x.outcome === 'replaced').map((x) => x.product_id) } });
    const missing = results.filter((x) => x.outcome === 'not_in_catalogue');
    return {
      partner, file_name: file.originalname, rows: parsed.length, counts, results,
      not_in_catalogue_csv: toCsv(['row', 'item_name', 'pack', 'company', 'reason'],
        missing.map((x) => ({ row: x.row, item_name: x.item_name, pack: x.pack, company: x.company, reason: x.message }))),
    };
  });
}
