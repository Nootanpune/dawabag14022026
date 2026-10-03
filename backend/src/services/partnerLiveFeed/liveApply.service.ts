// Sprint 37 — receiving one live stock snapshot from a partner's connector and
// applying it, in ONE transaction:
//   1. the partner must be in live mode (opt-in, admin) — otherwise 409;
//   2. ordering: sequence / taken_at (sequence.ts) — replay, unchanged or refused;
//   3. the lines go through the ONE import pipeline (insertImportTx → evaluateImport);
//   4. planSnapshot (plan.ts) decides the ledger writes and what waits for a person;
//   5. quantities are written to the partner's OWN ledger (partner_inventory — never
//      Dawabag's batches, C-05 / C-25 / C-28), checks are upserted (one open item per
//      thing) and the ones no longer needed are closed;
//   6. the feed's state, the import's result and one audit entry (C-46) are recorded.
// Notifications go out after the commit, only when new items start waiting.
import { PoolClient } from 'pg';
import { query, withTransactionRetry } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { evaluateImport } from '../partnerStockImport/evaluate';
import { ImportActor, insertImportTx, PreparedImport } from '../partnerStockImport/import.service';
import type { FeedCaller } from '../partnerApiKeys/keys.service';
import { CHECK_NOTIFY_QUIET_MINUTES, notifyNewChecks } from './alerts.service';
import { checkIdentity, LedgerBatch, Listing, planSnapshot, PlanRow, SnapshotPlan } from './plan';
import { decideSequence, effectiveTakenAt } from './sequence';
import { FeedRow } from './settings.service';

/** Lines of live snapshots are kept this long (the import record and its result stay longer). */
export const LIVE_ROWS_KEEP_HOURS = 48;
export const LIVE_IMPORTS_KEEP_DAYS = 90;

export interface SnapshotInput { prep: PreparedImport; sequence: number; takenAt: Date }

export interface SnapshotResult {
  status: 'applied' | 'unchanged' | 'replay';
  import_id: string | null;
  sequence: number;
  taken_at: string;
  applied: {
    lines: number; batches_set: number; batches_new: number; batches_zeroed: number; packs_offered: number;
    held_for_orders: number; dispatched_after_snapshot: number;
  };
  waiting_for_check: { new: number; open: number; by_kind: Record<string, number> };
  summary: Record<string, unknown> | null;
}

async function loadPlanInput(c: PoolClient, partnerId: string, importId: string, takenAt: Date, graceMinutes: number) {
  const rows = (await c.query<PlanRow>(
    `SELECT status, product_id, item_key, match_method, parsed, problems, warnings FROM partner_stock_import_rows
     WHERE import_id = $1 ORDER BY row_number`, [importId])).rows;
  const listings = new Map((await c.query<{ id: string; product_id: string; name: string; cold_chain: boolean }>(
    `SELECT pp.id, pp.product_id, p.name, COALESCE(p.cold_chain, FALSE) AS cold_chain FROM partner_products pp JOIN products p ON p.id = pp.product_id
     WHERE pp.partner_id = $1 AND pp.product_id IS NOT NULL`, [partnerId])).rows
    .map((r): [string, Listing] => [r.product_id, { ppId: r.id, productId: r.product_id, name: r.name, coldChain: r.cold_chain }]));
  // Locks the partner's batches: dispatch and allocation wait until the snapshot is written.
  // Sprint 38: in product order, then batch — the order checkout locks them in
  // (allocation.service), so the two cannot deadlock
  const ledger = (await c.query<LedgerBatch & { expiry_date: string }>(
    `SELECT pi.id, pi.partner_product_id AS "ppId", pp.product_id AS "productId", pi.batch_number, pi.qty_available, pi.qty_reserved,
            to_char(pi.expiry_date, 'YYYY-MM-DD') AS expiry_date, pi.mrp_paise, pi.sale_rate_paise
     FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id
     WHERE pi.partner_id = $1 ORDER BY pp.product_id NULLS LAST, pi.id FOR UPDATE OF pi`, [partnerId])).rows;
  // Units dispatched (= billed in the partner's software) after the snapshot was taken, less the grace
  const since = new Date(takenAt.getTime() - graceMinutes * 60_000);
  const dispatched = new Map((await c.query<{ id: string; n: number }>(
    `SELECT poi.partner_inv_id AS id, SUM(poi.allocated_qty)::int AS n FROM partner_order_items poi
     WHERE poi.partner_id = $1 AND poi.dispatched_at > $2 AND poi.dispatch_status IN ('dispatched', 'delivered', 'returned')
     GROUP BY poi.partner_inv_id`, [partnerId, since])).rows.map((r) => [r.id, Number(r.n)]));
  const dismissed = new Set((await c.query<{ item_key: string }>(
    `SELECT item_key FROM partner_feed_checks WHERE partner_id = $1 AND kind = 'new_product' AND status = 'dismissed'`, [partnerId])).rows
    .map((r) => r.item_key));
  return { rows, listings, ledger, dispatchedSince: dispatched, dismissed };
}

async function writeLedger(c: PoolClient, partnerId: string, plan: SnapshotPlan) {
  const existing = plan.writes.filter((w) => w.inventoryId);
  const fresh = plan.writes.filter((w) => !w.inventoryId);
  if (existing.length) {
    await c.query(
      `UPDATE partner_inventory pi SET qty_available = x.qty_available, feed_quantity = x.feed_quantity, expiry_date = x.expiry_date::date,
              mrp_paise = x.mrp_paise, sale_rate_paise = x.sale_rate_paise,
              purchase_price_paise = COALESCE(x.purchase_price_paise, pi.purchase_price_paise),
              feed_updated_at = NOW(), last_updated_at = NOW()
       FROM jsonb_to_recordset($2::jsonb) AS x("inventoryId" uuid, qty_available int, feed_quantity int, expiry_date text,
              mrp_paise int, sale_rate_paise int, purchase_price_paise int)
       WHERE pi.id = x."inventoryId" AND pi.partner_id = $1`, [partnerId, JSON.stringify(existing)]);
  }
  if (fresh.length) {
    // New batch of a listed, non-refrigerated product with a valid expiry (owner decision 2)
    await c.query(
      `INSERT INTO partner_inventory (partner_product_id, partner_id, batch_number, qty_available, expiry_date, purchase_price_paise,
         mrp_paise, sale_rate_paise, feed_quantity, feed_updated_at, cold_chain_confirmed)
       SELECT x."ppId", $1, x.batch_number, x.qty_available, x.expiry_date::date, x.purchase_price_paise, x.mrp_paise, x.sale_rate_paise,
              x.feed_quantity, NOW(), FALSE
       FROM jsonb_to_recordset($2::jsonb) AS x("ppId" uuid, batch_number text, qty_available int, expiry_date text,
              purchase_price_paise int, mrp_paise int, sale_rate_paise int, feed_quantity int)
       ON CONFLICT (partner_product_id, batch_number) DO UPDATE SET qty_available = GREATEST(EXCLUDED.qty_available, partner_inventory.qty_reserved),
         feed_quantity = EXCLUDED.feed_quantity, feed_updated_at = NOW(), last_updated_at = NOW()`,
      [partnerId, JSON.stringify(fresh)]);
  }
  let zeroed = 0;
  if (plan.zero.length) {
    zeroed = (await c.query(
      `UPDATE partner_inventory SET qty_available = qty_reserved, feed_quantity = 0, feed_updated_at = NOW(), last_updated_at = NOW()
       WHERE partner_id = $1 AND id = ANY($2::uuid[]) AND (qty_available <> qty_reserved OR feed_quantity IS DISTINCT FROM 0)`,
      [partnerId, plan.zero])).rowCount ?? 0;
  }
  for (const l of plan.learnt_links) {
    await c.query(
      `INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source)
       VALUES ($1, $2, $3, $4, 'auto') ON CONFLICT (partner_id, item_key) DO NOTHING`,
      [partnerId, l.item_key, l.product_id, l.label?.slice(0, 500) ?? null]);
  }
  return zeroed;
}

/** Upserts the planned checks, closes the open ones the snapshot no longer raises; returns how many are new. */
async function syncChecks(c: PoolClient, partnerId: string, importId: string, plan: SnapshotPlan) {
  let created = 0;
  for (const k of plan.checks) {
    const r = await c.query<{ inserted: boolean }>(
      `INSERT INTO partner_feed_checks (partner_id, kind, item_key, batch_key, product_id, partner_inventory_id, item_name, batch_number,
         details, last_import_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (partner_id, kind, item_key, batch_key) WHERE status = 'open' DO UPDATE SET
         product_id = EXCLUDED.product_id, partner_inventory_id = EXCLUDED.partner_inventory_id, item_name = EXCLUDED.item_name,
         batch_number = EXCLUDED.batch_number, last_seen_at = NOW(), last_import_id = EXCLUDED.last_import_id,
         -- the partner's request to Dawabag (new products) survives later snapshots
         details = EXCLUDED.details || jsonb_strip_nulls(jsonb_build_object('requested_at', partner_feed_checks.details->'requested_at'))
       RETURNING (xmax = 0) AS inserted`,
      [partnerId, k.kind, k.item_key.slice(0, 400), k.batch_key.slice(0, 120), k.product_id, k.inventory_id,
       k.item_name?.slice(0, 500) ?? null, k.batch_number?.slice(0, 100) ?? null, JSON.stringify(k.details), importId]);
    if (r.rows[0]?.inserted) created++;
  }
  const keep = plan.checks.map(checkIdentity);
  const closed = (await c.query(
    `UPDATE partner_feed_checks SET status = 'resolved', resolved_at = NOW(),
       resolution_note = 'No longer raised by the latest snapshot'
     WHERE partner_id = $1 AND status = 'open' AND NOT ((kind || '|' || item_key || '|' || batch_key) = ANY($2::text[]))`,
    [partnerId, keep])).rowCount ?? 0;
  return { created, closed };
}

export async function receiveSnapshot(caller: FeedCaller, input: SnapshotInput): Promise<SnapshotResult> {
  const partnerId = caller.partnerId;
  const actor: ImportActor = { userId: null, apiKey: { id: caller.keyId, prefix: caller.prefix } };
  let notify: { count: number } | null = null;

  const result = await withTransactionRetry(async (c) => {
    // One snapshot at a time per partner (row lock); a partner never set up has no row → manual
    const feed = (await c.query<FeedRow>('SELECT * FROM partner_stock_feeds WHERE partner_id = $1 FOR UPDATE', [partnerId])).rows[0];
    if (!feed || feed.mode !== 'live') {
      throw new AppError('Live stock feed is not switched on for this partner. Dawabag\'s admin switches it on (Admin → Partners → Stock feed); until then send files to /stock-files', 409);
    }
    const now = new Date();
    const decision = decideSequence(
      { sequence: feed.last_sequence === null ? null : Number(feed.last_sequence), takenAt: feed.last_taken_at, sha256: feed.last_sha256 },
      { sequence: input.sequence, takenAt: input.takenAt, sha256: input.prep.sha256 }, now);
    if (decision.action === 'reject') throw new AppError(decision.message, decision.status);
    if (decision.action === 'replay') {
      // The same snapshot again (a retry): nothing changes, the earlier answer is repeated
      return { ...(feed.last_result as unknown as SnapshotResult), status: 'replay' as const };
    }
    const takenAt = effectiveTakenAt(input.takenAt, now);

    let importId: string;
    let summary: Record<string, unknown>;
    if (decision.action === 'unchanged' && feed.last_import_id) {
      importId = feed.last_import_id;
      summary = await evaluateImport(c, importId, partnerId) as unknown as Record<string, unknown>;   // catalogue / links may have changed
    } else {
      const made = await insertImportTx(c, partnerId, actor, input.prep, { sequence: input.sequence, takenAt });
      importId = made.id;
      summary = made.summary as unknown as Record<string, unknown>;
    }

    const openBefore = Number((await c.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM partner_feed_checks WHERE partner_id = $1 AND status = 'open'`, [partnerId])).rows[0].n);
    const plan = planSnapshot(await loadPlanInput(c, partnerId, importId, takenAt, feed.billing_grace_minutes));
    const zeroed = await writeLedger(c, partnerId, plan);
    const checks = await syncChecks(c, partnerId, importId, plan);
    const byKind = Object.fromEntries((await c.query<{ kind: string; n: number }>(
      `SELECT kind, COUNT(*)::int AS n FROM partner_feed_checks WHERE partner_id = $1 AND status = 'open' GROUP BY kind`, [partnerId])).rows
      .map((r) => [r.kind, r.n]));
    const open = Object.values(byKind).reduce((a, n) => a + n, 0);

    const out: SnapshotResult = {
      status: decision.action === 'unchanged' ? 'unchanged' : 'applied',
      import_id: importId, sequence: input.sequence, taken_at: takenAt.toISOString(),
      applied: {
        lines: plan.lines_applied,
        batches_set: plan.writes.filter((w) => w.inventoryId).length,
        batches_new: plan.writes.filter((w) => !w.inventoryId).length,
        batches_zeroed: zeroed,
        packs_offered: plan.writes.reduce((a, w) => a + Math.max(0, w.qty_available), 0),
        held_for_orders: plan.held_for_orders,
        dispatched_after_snapshot: plan.dispatched_after_snapshot,
      },
      waiting_for_check: { new: checks.created, open, by_kind: byKind },
      summary,
    };
    // De-duplicated alert: only when new items start waiting, and not more than once an hour
    const quiet = feed.checks_notified_at && now.getTime() - new Date(feed.checks_notified_at).getTime() < CHECK_NOTIFY_QUIET_MINUTES * 60_000;
    if (checks.created > 0 && (openBefore === 0 || !quiet)) notify = { count: open };

    await c.query(
      `UPDATE partner_stock_feeds SET last_sequence = $2, last_taken_at = $3, last_received_at = NOW(), last_sha256 = $4,
         last_import_id = $5, last_result = $6, stale_alerted_at = NULL,
         checks_notified_at = CASE WHEN $7 THEN NOW() ELSE checks_notified_at END
       WHERE partner_id = $1`,
      [partnerId, input.sequence, takenAt, input.prep.sha256, importId, JSON.stringify(out), !!notify]);
    await c.query(
      `UPDATE partner_stock_imports SET status = 'applied', applied_at = NOW(), result = $2, updated_at = NOW() WHERE id = $1`,
      [importId, JSON.stringify(out.applied)]);
    // C-46: one entry per snapshot — by the key's prefix, never the key; what changed
    await writeAuditTx(c, { userId: null, action: 'partner_stock_feed_applied', performedBy: null,
      newValue: { vendor_id: partnerId, import_id: importId, sequence: input.sequence, taken_at: takenAt, sha256: input.prep.sha256,
        status: out.status, ...out.applied, checks_new: checks.created, checks_closed: checks.closed, checks_open: open,
        via: 'api_key', api_key_id: caller.keyId, api_key_prefix: caller.prefix } });
    return out;
  });

  if (notify) {
    try { await notifyNewChecks(partnerId, caller.partnerName, (notify as { count: number }).count); }
    catch (e) { logger.error(`Stock feed: could not queue the check notification for ${partnerId}: ${(e as Error).message}`); }
  }
  if (result.status !== 'replay') await purgeOldLiveImports(partnerId, result.import_id);
  return result;
}

/** Storage limitation (C-44): lines of old live snapshots go after 48 h, the records after 90 days (audit keeps the trail). */
export async function purgeOldLiveImports(partnerId: string, keepId: string | null) {
  try {
    await query(
      `DELETE FROM partner_stock_import_rows WHERE import_id IN (
         SELECT id FROM partner_stock_imports WHERE partner_id = $1 AND mode = 'live' AND created_at < NOW() - make_interval(hours => $2)
           AND id IS DISTINCT FROM $3::uuid LIMIT 50)`, [partnerId, LIVE_ROWS_KEEP_HOURS, keepId]);
    await query(
      `DELETE FROM partner_stock_imports WHERE partner_id = $1 AND mode = 'live' AND created_at < NOW() - make_interval(days => $2)
         AND id IS DISTINCT FROM $3::uuid
         AND NOT EXISTS (SELECT 1 FROM partner_stock_feeds f WHERE f.last_import_id = partner_stock_imports.id)`,
      [partnerId, LIVE_IMPORTS_KEEP_DAYS, keepId]);
  } catch (e) {
    logger.warn(`Stock feed: purge of old snapshots for ${partnerId} failed: ${(e as Error).message}`);
  }
}

/** Daily (retention_purge): lines of live snapshots older than 48 h, for every partner — also those no longer live. */
export async function purgeLiveSnapshotLines(): Promise<number> {
  const rows = await query(
    `DELETE FROM partner_stock_import_rows WHERE import_id IN (
       SELECT i.id FROM partner_stock_imports i WHERE i.mode = 'live' AND i.created_at < NOW() - make_interval(hours => $1)
         AND NOT EXISTS (SELECT 1 FROM partner_stock_feeds f WHERE f.last_import_id = i.id))
     RETURNING 1`, [LIVE_ROWS_KEEP_HOURS]);
  return rows.length;
}
