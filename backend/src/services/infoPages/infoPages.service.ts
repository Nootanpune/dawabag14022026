// Trust pages (Sprint 33): "Genuine medicines", "Expired, damaged and recalled
// medicines" and "Every order is checked by a pharmacist". Kept on the server,
// versioned (a new version never overwrites an old one) and published by admins,
// audited (C-46). The words must describe only what the system does (C-04, C-17):
// numbers that admins can change — return windows, shelf-life rules — are not
// typed into the text but filled from the live settings when the page is shown.
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { getSetting } from '../settings.service';
import { PARTNER_MIN_SHELF_DAYS } from '../stock/partnerStock';
import { fillTokens, INFO_PAGE_KEYS, InfoPageKey } from './tokens';

/** Values for the {{tokens}} a page may use — always today's settings. */
async function tokenValues(): Promise<Record<string, string>> {
  return {
    // the shop never supplies a batch with this many days or fewer left (allocation, partner stock)
    sell_min_shelf_days: String(PARTNER_MIN_SHELF_DAYS),
    receive_min_shelf_days: String(Number(await getSetting('purchasing.min_shelf_life_days', 180))),
    returns_report_hours: String(Number(await getSetting('returns.report_within_hours', 48))),
    returns_expiry_claim_days: String(Number(await getSetting('returns.expiry_claim_days', 30))),
    returns_near_expiry_days: String(Number(await getSetting('returns.near_expiry_days', 90))),
  };
}

export async function listInfoPages() {
  return query(
    `SELECT DISTINCT ON (page_key) page_key, version, title, summary, published_at
     FROM info_pages ORDER BY page_key, version DESC`);
}

export async function getInfoPage(key: InfoPageKey) {
  const p = await queryOne<any>(
    `SELECT page_key, version, title, summary, body, published_at FROM info_pages
     WHERE page_key = $1 ORDER BY version DESC LIMIT 1`, [key]);
  if (!p) throw new AppError('Page not found', 404);
  const values = await tokenValues();
  return { ...p, body: fillTokens(p.body, values), summary: fillTokens(p.summary, values) };
}

/** Admin: every version, newest first, with the raw text (tokens unfilled). */
export async function infoPageHistory(key: InfoPageKey) {
  return query(
    `SELECT i.page_key, i.version, i.title, i.summary, i.body, i.published_at, up.full_name AS published_by_name
     FROM info_pages i LEFT JOIN user_profiles up ON up.user_id = i.published_by
     WHERE i.page_key = $1 ORDER BY i.version DESC LIMIT 50`, [key]);
}

export async function publishInfoPage(adminId: string, key: InfoPageKey, input: { title: string; summary: string; body: string }) {
  if (!(INFO_PAGE_KEYS as readonly string[]).includes(key)) throw new AppError('Page not found', 404);
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`info_page:${key}`]);
    const version = Number((await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM info_pages WHERE page_key = $1`, [key])).rows[0].v);
    const row = (await client.query(
      `INSERT INTO info_pages (page_key, version, title, summary, body, published_by) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING page_key, version, published_at`, [key, version, input.title, input.summary, input.body, adminId])).rows[0];
    await writeAuditTx(client, { userId: null, action: 'info_page_published', performedBy: adminId,
      newValue: { page_key: key, version, title: input.title } });
    return row;
  });
}
