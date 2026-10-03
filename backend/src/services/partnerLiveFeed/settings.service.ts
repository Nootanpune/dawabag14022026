// Sprint 37 — a partner's stock-feed settings: manual (portal / file uploads a person
// applies) or live (the connector's snapshots apply quantities automatically). Live is
// opt-in per partner and switched by Dawabag's admin (owner decision 2026-10-03).
// While live, MediVision is the only authority for the partner's quantities: the
// portal's stock editor and file apply are refused (assertManualStock).
import { PoolClient } from 'pg';
import { queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';

export type FeedMode = 'manual' | 'live';
export type StalePolicy = 'hide' | 'margin';

export interface FeedSettings {
  mode: FeedMode;
  stale_after_minutes: number;
  stale_policy: StalePolicy;
  stale_margin_pct: number;
  billing_grace_minutes: number;
}

export const DEFAULT_FEED: FeedSettings = { mode: 'manual', stale_after_minutes: 15, stale_policy: 'hide', stale_margin_pct: 50, billing_grace_minutes: 0 };

export interface FeedRow extends FeedSettings {
  partner_id: string;
  last_sequence: string | number | null;
  last_taken_at: Date | null;
  last_received_at: Date | null;
  last_sha256: string | null;
  last_import_id: string | null;
  last_result: Record<string, unknown> | null;
  stale_alerted_at: Date | null;
  checks_notified_at: Date | null;
  mode_changed_at: Date | null;
  updated_at: Date | null;
}

type Db = Pick<PoolClient, 'query'>;

export async function loadFeed(partnerId: string, db?: Db): Promise<FeedRow> {
  const sql = 'SELECT * FROM partner_stock_feeds WHERE partner_id = $1';
  const row = db ? (await db.query<FeedRow>(sql, [partnerId])).rows[0] : await queryOne<FeedRow>(sql, [partnerId]);
  return row ?? {
    partner_id: partnerId, ...DEFAULT_FEED, last_sequence: null, last_taken_at: null, last_received_at: null, last_sha256: null,
    last_import_id: null, last_result: null, stale_alerted_at: null, checks_notified_at: null, mode_changed_at: null, updated_at: null,
  };
}

/** Fresh = a snapshot within the stale window (live mode only). Pure. */
export function feedFreshness(f: Pick<FeedRow, 'mode' | 'last_taken_at' | 'stale_after_minutes'>, now = new Date()) {
  if (f.mode !== 'live') return { stale: false, stale_since: null as Date | null };
  if (!f.last_taken_at) return { stale: true, stale_since: null };
  const limit = new Date(new Date(f.last_taken_at).getTime() + f.stale_after_minutes * 60_000);
  return limit < now ? { stale: true, stale_since: limit } : { stale: false, stale_since: null };
}

/** No second authority (owner's standing rule): a live partner's quantities come only from its software. */
export async function assertManualStock(partnerId: string, db?: Db) {
  const f = await loadFeed(partnerId, db);
  if (f.mode === 'live') {
    throw new AppError('Your stock comes from your billing software (live feed), so it cannot be changed here. Correct it in the software; the next snapshot updates Dawabag', 409);
  }
}

export async function updateFeedSettings(partnerId: string, adminId: string, input: Partial<FeedSettings>) {
  return withTransaction(async (c) => {
    const v = (await c.query<{ id: string }>('SELECT id FROM vendors WHERE id = $1', [partnerId])).rows[0];
    if (!v) throw new AppError('Partner not found', 404);
    const before = await loadFeed(partnerId, c);
    const next: FeedSettings = {
      mode: input.mode ?? before.mode,
      stale_after_minutes: input.stale_after_minutes ?? before.stale_after_minutes,
      stale_policy: input.stale_policy ?? before.stale_policy,
      stale_margin_pct: input.stale_margin_pct ?? before.stale_margin_pct,
      billing_grace_minutes: input.billing_grace_minutes ?? before.billing_grace_minutes,
    };
    const modeChanged = next.mode !== before.mode;
    await c.query(
      `INSERT INTO partner_stock_feeds (partner_id, mode, stale_after_minutes, stale_policy, stale_margin_pct, billing_grace_minutes,
         mode_changed_at, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NOW() END, $8, NOW())
       ON CONFLICT (partner_id) DO UPDATE SET mode = EXCLUDED.mode, stale_after_minutes = EXCLUDED.stale_after_minutes,
         stale_policy = EXCLUDED.stale_policy, stale_margin_pct = EXCLUDED.stale_margin_pct,
         billing_grace_minutes = EXCLUDED.billing_grace_minutes,
         mode_changed_at = CASE WHEN $7 THEN NOW() ELSE partner_stock_feeds.mode_changed_at END,
         -- switching live on again: the old snapshot does not count as fresh, and staleness alerts start over
         stale_alerted_at = CASE WHEN $7 THEN NULL ELSE partner_stock_feeds.stale_alerted_at END,
         last_taken_at = CASE WHEN $7 AND EXCLUDED.mode = 'live' THEN NULL ELSE partner_stock_feeds.last_taken_at END,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [partnerId, next.mode, next.stale_after_minutes, next.stale_policy, next.stale_margin_pct, next.billing_grace_minutes, modeChanged, adminId]);
    let closed = 0;
    if (modeChanged && next.mode === 'manual') {
      // Back to manual: nothing waits on the feed any more
      closed = (await c.query(
        `UPDATE partner_feed_checks SET status = 'resolved', resolved_at = NOW(), resolved_by = $2,
           resolution_note = 'Live stock feed switched off' WHERE partner_id = $1 AND status = 'open'`, [partnerId, adminId])).rowCount ?? 0;
    }
    // C-46: who switched a partner's stock authority, and the staleness rule
    await writeAuditTx(c, { userId: null, action: modeChanged ? 'partner_stock_feed_mode_changed' : 'partner_stock_feed_settings_changed',
      performedBy: adminId, oldValue: { vendor_id: partnerId, ...pick(before) }, newValue: { vendor_id: partnerId, ...next, checks_closed: closed } });
    return loadFeed(partnerId, c);
  });
}

const pick = (f: FeedSettings): FeedSettings => ({
  mode: f.mode, stale_after_minutes: f.stale_after_minutes, stale_policy: f.stale_policy,
  stale_margin_pct: f.stale_margin_pct, billing_grace_minutes: f.billing_grace_minutes,
});
