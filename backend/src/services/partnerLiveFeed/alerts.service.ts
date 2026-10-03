// Sprint 37 — the urgent flags of the live stock feed (owner decision 3, 2026-10-03):
//   • counts for the blinking badge in the admin and partner portals (read from the
//     server on every poll — nothing kept in the browser, standing rule);
//   • one notification (in-app + email) to the partner's owner login and Dawabag's
//     admins when NEW items start waiting — not one per snapshot;
//   • one alert to the admins when a live feed goes stale (again only after it recovered).
import { query, queryOne } from '../../config/database';
import { writeAudit } from '../../utils/audit';
import { formatDateTimeIST } from '../../utils/ist';
import { queueNotification } from '../notification.service';
import { feedFreshness, FeedRow, loadFeed } from './settings.service';

/** Do not email about new items more often than this per partner (more arrive in bursts). */
export const CHECK_NOTIFY_QUIET_MINUTES = 60;

async function recipients(partnerId: string) {
  return query<{ id: string; who: 'admin' | 'partner' }>(
    `SELECT u.id, 'admin' AS who FROM users u WHERE u.role IN ('admin', 'super_admin') AND u.is_active = TRUE AND u.deleted_at IS NULL
     UNION
     SELECT vu.user_id, 'partner' FROM vendor_users vu JOIN users u ON u.id = vu.user_id
     WHERE vu.vendor_id = $1 AND vu.is_owner AND u.is_active = TRUE AND u.deleted_at IS NULL`, [partnerId]);
}

export async function notifyNewChecks(partnerId: string, partnerName: string, count: number) {
  for (const r of await recipients(partnerId)) {
    await queueNotification({ userId: r.id, type: 'stock_feed_checks', count, partnerName, partnerId,
      where: r.who === 'admin' ? 'Admin → Live stock feeds' : 'Partner portal → Live stock feed' });
  }
}

const policyText = (f: FeedRow) => (f.stale_policy === 'hide'
  ? 'Its stock is not offered to buyers until a snapshot arrives.'
  : `Only ${100 - f.stale_margin_pct}% of its stock is offered until a snapshot arrives.`);

/** Scheduled every 5 minutes: alerts admins (and the partner's owner) once per stale spell. */
export async function runLiveFeedWatch() {
  const feeds = await query<FeedRow & { name: string }>(
    `SELECT f.*, v.name FROM partner_stock_feeds f JOIN vendors v ON v.id = f.partner_id
     WHERE f.mode = 'live' AND f.stale_alerted_at IS NULL AND v.is_active = TRUE
       AND (f.last_taken_at IS NULL OR f.last_taken_at < NOW() - make_interval(mins => f.stale_after_minutes))
       -- just switched on and nothing sent yet: give the connector one window first
       AND COALESCE(f.last_taken_at, f.mode_changed_at, f.updated_at) < NOW() - make_interval(mins => f.stale_after_minutes)`);
  let alerted = 0;
  for (const f of feeds) {
    // Claimed in one statement, so two API servers never alert twice
    const claimed = await queryOne('UPDATE partner_stock_feeds SET stale_alerted_at = NOW() WHERE partner_id = $1 AND stale_alerted_at IS NULL RETURNING 1', [f.partner_id]);
    if (!claimed) continue;
    const lastAt = f.last_taken_at ? formatDateTimeIST(f.last_taken_at) : 'live mode was switched on (none received yet)';
    for (const r of await recipients(f.partner_id)) {
      await queueNotification({ userId: r.id, type: 'stock_feed_stale', partnerName: f.name, partnerId: f.partner_id, lastAt, policy: policyText(f) });
    }
    await writeAudit({ userId: null, action: 'partner_stock_feed_stale', performedBy: null,
      newValue: { vendor_id: f.partner_id, last_taken_at: f.last_taken_at, stale_after_minutes: f.stale_after_minutes, policy: f.stale_policy } });
    alerted++;
  }
  return { stale_feeds_alerted: alerted };
}

export interface FeedStatus {
  partner_id: string;
  mode: FeedRow['mode'];
  stale_after_minutes: number;
  stale_policy: FeedRow['stale_policy'];
  stale_margin_pct: number;
  billing_grace_minutes: number;
  last_sequence: number | null;
  last_taken_at: Date | null;
  last_received_at: Date | null;
  stale: boolean;
  stale_since: Date | null;
  last_result: Record<string, unknown> | null;
  waiting_checks: number;
  waiting_by_kind: Record<string, number>;
  /** Packs held back on Dawabag for orders the partner has not dispatched (billed) yet */
  held_for_orders: number;
}

export async function feedStatus(partnerId: string): Promise<FeedStatus> {
  const f = await loadFeed(partnerId);
  const [kinds, held] = await Promise.all([
    query<{ kind: string; n: number }>(
      `SELECT kind, COUNT(*)::int AS n FROM partner_feed_checks WHERE partner_id = $1 AND status = 'open' GROUP BY kind`, [partnerId]),
    queryOne<{ n: number }>('SELECT COALESCE(SUM(qty_reserved), 0)::int AS n FROM partner_inventory WHERE partner_id = $1', [partnerId]),
  ]);
  const byKind = Object.fromEntries(kinds.map((k) => [k.kind, k.n]));
  return {
    partner_id: partnerId, mode: f.mode, stale_after_minutes: f.stale_after_minutes, stale_policy: f.stale_policy,
    stale_margin_pct: f.stale_margin_pct, billing_grace_minutes: f.billing_grace_minutes,
    last_sequence: f.last_sequence === null ? null : Number(f.last_sequence),
    last_taken_at: f.last_taken_at, last_received_at: f.last_received_at, ...feedFreshness(f),
    last_result: f.last_result, waiting_checks: kinds.reduce((a, k) => a + k.n, 0), waiting_by_kind: byKind,
    held_for_orders: held?.n ?? 0,
  };
}

/** For the partner portal's badge: small and cheap, polled every minute. */
export async function partnerAlerts(partnerId: string) {
  const s = await feedStatus(partnerId);
  return { mode: s.mode, waiting_checks: s.waiting_checks, stale: s.stale, last_taken_at: s.last_taken_at };
}

/** For the admin portal's badge and the "Live stock feeds" page. */
export async function adminFeedAlerts() {
  const rows = await query<{ partner_id: string; name: string; mode: string; last_taken_at: Date | null; stale_after_minutes: number;
    stale_policy: string; waiting: number }>(
    `SELECT v.id AS partner_id, v.name, COALESCE(f.mode, 'manual') AS mode, f.last_taken_at, COALESCE(f.stale_after_minutes, 15) AS stale_after_minutes,
            COALESCE(f.stale_policy, 'hide') AS stale_policy,
            (SELECT COUNT(*)::int FROM partner_feed_checks c WHERE c.partner_id = v.id AND c.status = 'open') AS waiting
     FROM vendors v LEFT JOIN partner_stock_feeds f ON f.partner_id = v.id
     WHERE f.mode = 'live' OR EXISTS (SELECT 1 FROM partner_feed_checks c WHERE c.partner_id = v.id AND c.status = 'open')
     ORDER BY v.name`);
  const partners = rows.map((r) => ({ ...r, ...feedFreshness({ mode: r.mode as FeedRow['mode'], last_taken_at: r.last_taken_at, stale_after_minutes: r.stale_after_minutes }) }));
  return {
    waiting_checks: partners.reduce((a, p) => a + p.waiting, 0),
    stale_feeds: partners.filter((p) => p.stale).length,
    partners,
  };
}
