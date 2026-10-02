// Runs the mapping, matching and checks over every row of an import and stores the
// outcome on the rows (server-side; the browser only displays it). Run after upload,
// after the partner confirms columns or links a product, and again inside apply so
// the ledger is written from fresh checks.
import { PoolClient } from 'pg';
import { batchKey } from '../recallAlerts/batchKey';
import { PARTNER_MIN_SHELF_DAYS } from '../stock/partnerStock';
import { todayIST } from '../../utils/ist';
import { Mapping, missingRequired } from './fields';
import { buildMatchContext, CatalogueProduct, Candidate, MatchContext, matchRow } from './match';
import { ParsedRow, prepareRows } from './rows';
import { checkAgainstProduct, checkLine, duplicateBatchChecks } from './validate';

export type Db = Pick<PoolClient, 'query'>;
export type RowStatus = 'matched' | 'needs_review' | 'problem' | 'skipped';

export interface ImportSummary {
  lines: number;               // stock lines (not totals / headings)
  matched: number;
  needs_review: number;
  problem: number;
  skipped: number;
  requested: number;           // needs review, new product requested
  products: number;            // distinct matched products
  new_listings: number;        // matched products the partner does not list yet
  cold_chain_products: number;
  h1_new_listings: number;
  packs: number;               // packs on matched lines
}

export async function loadMatchContext(db: Db, partnerId: string): Promise<MatchContext> {
  const [products, links, listings] = await Promise.all([
    db.query<CatalogueProduct>(
      `SELECT id, name, generic_name, net_quantity, drug_schedule, manufacturer_name, marketed_by, mrp_paise,
              offer_price_paise, hsn_code, gst_rate, COALESCE(cold_chain, FALSE) AS cold_chain
       FROM products WHERE is_active = TRUE AND deleted_at IS NULL`),
    db.query<{ item_key: string; product_id: string }>(
      'SELECT item_key, product_id FROM partner_item_links WHERE partner_id = $1', [partnerId]),
    db.query<{ product_id: string; partner_sku: string | null }>(
      'SELECT product_id, partner_sku FROM partner_products WHERE partner_id = $1 AND product_id IS NOT NULL', [partnerId]),
  ]);
  return buildMatchContext(products.rows, links.rows, listings.rows);
}

/** Recall / uncleared regulator alert per (product, batch) — same rule as receiptGate (C-28). */
async function recallMessages(db: Db, pairs: { product_id: string; batch_number: string }[]) {
  const out = new Map<string, string>();
  if (!pairs.length) return out;
  const { rows } = await db.query<{ product_id: string; batch_number: string; recalled: boolean; alert_no: string | null }>(
    `SELECT x.product_id, x.batch_number,
            EXISTS (SELECT 1 FROM batch_recalls br WHERE br.product_id = x.product_id AND upper(br.batch_number) = upper(x.batch_number)) AS recalled,
            (SELECT a.alert_no FROM recall_alert_lines l JOIN recall_alerts a ON a.id = l.alert_id
              WHERE l.batch_key = x.bkey AND NOT EXISTS (
                SELECT 1 FROM recall_alert_matches m WHERE m.line_id = l.id AND m.product_id = x.product_id AND m.decision = 'cleared')
              ORDER BY a.received_at DESC LIMIT 1) AS alert_no
     FROM jsonb_to_recordset($1::jsonb) AS x(product_id uuid, batch_number text, bkey text)`,
    [JSON.stringify(pairs.map((p) => ({ ...p, bkey: batchKey(p.batch_number) })))]);
  for (const r of rows) {
    const k = `${r.product_id}|${batchKey(r.batch_number)}`;
    if (r.recalled) out.set(k, `Batch ${r.batch_number} is recalled and cannot be listed (C-28)`);
    else if (r.alert_no) out.set(k, `Batch ${r.batch_number} is on recall alert ${r.alert_no}; Dawabag must clear it before it can be listed (C-28)`);
  }
  return out;
}

async function reservedByBatch(db: Db, partnerId: string) {
  const { rows } = await db.query<{ product_id: string; batch_number: string; qty_reserved: number }>(
    `SELECT pp.product_id, pi.batch_number, pi.qty_reserved FROM partner_inventory pi
     JOIN partner_products pp ON pp.id = pi.partner_product_id
     WHERE pi.partner_id = $1 AND pi.qty_reserved > 0`, [partnerId]);
  return new Map(rows.map((r) => [`${r.product_id}|${batchKey(r.batch_number)}`, Number(r.qty_reserved)]));
}

interface EvaluatedRow {
  id: string;
  status: RowStatus;
  parsed: ParsedRow;
  item_key: string | null;
  product_id: string | null;
  match_method: string | null;
  problems: string[];
  warnings: string[];
  candidates: Candidate[];
}

export async function evaluateImport(db: Db, importId: string, partnerId: string): Promise<ImportSummary> {
  const imp = (await db.query<{ mapping: Mapping }>('SELECT mapping FROM partner_stock_imports WHERE id = $1', [importId])).rows[0];
  const stored = (await db.query<{ id: string; row_number: number; raw: string[]; new_product_requested: boolean; product_id: string | null; match_method: string | null }>(
    'SELECT id, row_number, raw, new_product_requested, product_id, match_method FROM partner_stock_import_rows WHERE import_id = $1 ORDER BY row_number',
    [importId])).rows;
  const mapping = imp?.mapping ?? {};
  const prepared = missingRequired(mapping).length ? null : prepareRows(stored.map((r) => ({ rowNumber: r.row_number, cells: r.raw })), mapping);
  const ctx = await loadMatchContext(db, partnerId);
  const today = todayIST();

  const results: EvaluatedRow[] = stored.map((s, i) => {
    const p = prepared?.[i];
    if (!p) {
      return { id: s.id, status: 'needs_review', parsed: null as unknown as ParsedRow, item_key: null, product_id: null, match_method: null,
        problems: [], warnings: ['Choose which column holds each detail first'], candidates: [] };
    }
    if (p.skip) {
      return { id: s.id, status: 'skipped', parsed: p.parsed, item_key: null, product_id: null, match_method: null, problems: [], warnings: [p.skip], candidates: [] };
    }
    const m = matchRow({ item_key: p.itemKey, ...p.parsed }, ctx);
    const line = checkLine(p.parsed, { today, minShelfDays: PARTNER_MIN_SHELF_DAYS });
    const problems = [...p.problems, ...line.problems];
    const warnings = [...p.warnings, ...line.warnings];
    if (!m.productId && m.reason) warnings.unshift(m.reason);
    return { id: s.id, status: 'needs_review', parsed: p.parsed, item_key: p.itemKey, product_id: m.productId,
      match_method: m.method, problems, warnings, candidates: m.candidates };
  });

  // Checks that need the matched product
  const live = results.filter((r) => r.status !== 'skipped' && r.parsed);
  const pairs = live.filter((r) => r.product_id && r.parsed.batch_number)
    .map((r) => ({ product_id: r.product_id!, batch_number: r.parsed.batch_number! }));
  const [recalls, reserved] = await Promise.all([recallMessages(db, pairs), reservedByBatch(db, partnerId)]);
  const dupes = duplicateBatchChecks(live.filter((r) => r.parsed.batch_number && (r.product_id || r.item_key)).map((r) => ({
    key: `${r.product_id ?? r.item_key}|${batchKey(r.parsed.batch_number!)}`,
    rowNumber: stored.find((s) => s.id === r.id)!.row_number,
    expiry: r.parsed.expiry_date,
  })));
  const rowNo = new Map(stored.map((s) => [s.id, s.row_number]));
  const requested = new Map(stored.map((s) => [s.id, s.new_product_requested]));
  for (const r of live) {
    const d = dupes.get(rowNo.get(r.id)!);
    if (d?.problem) r.problems.push(d.problem);
    if (d?.warning) r.warnings.push(d.warning);
    if (r.product_id) {
      const product = ctx.products.get(r.product_id)!;
      const k = `${r.product_id}|${batchKey(r.parsed.batch_number ?? '')}`;
      const c = checkAgainstProduct(r.parsed, product, {
        today, minShelfDays: PARTNER_MIN_SHELF_DAYS, recalled: recalls.get(k) ?? null, reserved: reserved.get(k), listed: ctx.listed.has(r.product_id),
      });
      r.problems.push(...c.problems);
      r.warnings.push(...c.warnings);
    }
    r.status = r.problems.length ? 'problem' : r.product_id ? 'matched' : 'needs_review';
  }

  await db.query(
    `UPDATE partner_stock_import_rows r SET status = x.status, parsed = x.parsed, item_key = x.item_key, product_id = x.product_id,
            match_method = CASE WHEN x.product_id IS NULL THEN NULL
                                WHEN r.match_method = 'manual' AND r.product_id = x.product_id THEN 'manual' ELSE x.match_method END,
            problems = x.problems, warnings = x.warnings, candidates = x.candidates,
            new_product_requested = r.new_product_requested AND x.product_id IS NULL
     FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, status text, parsed jsonb, item_key text, product_id uuid, match_method text,
                                            problems jsonb, warnings jsonb, candidates jsonb)
     WHERE r.id = x.id AND r.import_id = $2`,
    [JSON.stringify(results), importId]);

  const matched = results.filter((r) => r.status === 'matched');
  const products = new Set(matched.map((r) => r.product_id!));
  const newListings = [...products].filter((id) => !ctx.listed.has(id));
  const summary: ImportSummary = {
    lines: results.filter((r) => r.status !== 'skipped').length,
    matched: matched.length,
    needs_review: results.filter((r) => r.status === 'needs_review').length,
    problem: results.filter((r) => r.status === 'problem').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    requested: results.filter((r) => r.status === 'needs_review' && requested.get(r.id)).length,
    products: products.size,
    new_listings: newListings.length,
    cold_chain_products: [...products].filter((id) => ctx.products.get(id)?.cold_chain).length,
    h1_new_listings: newListings.filter((id) => ctx.products.get(id)?.drug_schedule === 'Schedule H1').length,
    packs: matched.reduce((a, r) => a + (r.parsed.total_quantity ?? 0), 0),
  };
  await db.query('UPDATE partner_stock_imports SET summary = $2, evaluated_at = NOW(), updated_at = NOW() WHERE id = $1',
    [importId, JSON.stringify(summary)]);
  return summary;
}
