// Sprint 36 — partner API keys for the stock feed (groundwork for automatic uploads
// from the partner's billing software). An admin, or the partner's owner login,
// issues, lists and revokes keys. A key:
//   * is shown ONCE when issued; only its SHA-256 and public prefix are stored;
//   * is scoped to "stock_upload" for that one partner (nothing else accepts it);
//   * is checked in constant time, and refused once revoked or while the partner
//     is not approved and active;
//   * is rate-limited per key per hour (Redis counter on the server, not on any device);
//   * is audited on issue, revoke, every use and every refusal of a known key —
//     by prefix, never the secret (C-44, C-46).
import { query, queryOne, withTransaction } from '../../config/database';
import { getRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { writeAudit, writeAuditTx } from '../../utils/audit';
import { generateKey, hourlyLimit, keyMatches, keyPrefix, labelProblems, maskedKey, MAX_ACTIVE_KEYS, rateWindowKey } from './keys';

export const KEY_SCOPES = ['stock_upload'] as const;
export type KeyScope = typeof KEY_SCOPES[number];

/** What lists show. Never the hash, never the secret. */
const KEY_COLS = `k.id, k.partner_id, k.prefix, k.label, k.scope, k.created_at, k.last_used_at, k.use_count,
  k.revoked_at, k.revoke_reason,
  (SELECT full_name FROM user_profiles WHERE user_id = k.created_by) AS created_by_name,
  (SELECT full_name FROM user_profiles WHERE user_id = k.revoked_by) AS revoked_by_name`;

export interface Issuer { userId: string; as: 'admin' | 'partner_owner' }

export async function listKeys(partnerId: string) {
  const keys = await query<any>(
    `SELECT ${KEY_COLS} FROM partner_api_keys k WHERE k.partner_id = $1 ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC LIMIT 100`,
    [partnerId]);
  return keys.map((k) => ({ ...k, masked: maskedKey(k.prefix), active: !k.revoked_at }));
}

/** Issues a key. The returned `secret` is the only time anyone sees it. */
export async function issueKey(partnerId: string, label: string, by: Issuer) {
  const problems = labelProblems(label);
  if (problems.length) throw new AppError(problems.join('; '), 400);
  const tidy = label.trim().replace(/\s+/g, ' ');
  return withTransaction(async (c) => {
    const vendor = (await c.query<{ id: string; name: string }>('SELECT id, name FROM vendors WHERE id = $1 FOR UPDATE', [partnerId])).rows[0];
    if (!vendor) throw new AppError('Partner not found', 404);
    const active = Number((await c.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM partner_api_keys WHERE partner_id = $1 AND revoked_at IS NULL', [partnerId])).rows[0].n);
    if (active >= MAX_ACTIVE_KEYS) {
      throw new AppError(`This partner already has ${MAX_ACTIVE_KEYS} keys in use. Revoke one it no longer needs first`, 409);
    }
    const k = generateKey();
    const row = (await c.query(
      `INSERT INTO partner_api_keys (partner_id, prefix, key_sha256, label, scope, created_by)
       VALUES ($1, $2, $3, $4, 'stock_upload', $5) RETURNING id`, [partnerId, k.prefix, k.sha256, tidy, by.userId])).rows[0];
    await writeAuditTx(c, { userId: null, action: 'partner_api_key_issued', performedBy: by.userId,
      newValue: { vendor_id: partnerId, key_id: row.id, prefix: k.prefix, label: tidy, scope: 'stock_upload', issued_as: by.as } });
    const key = (await c.query(`SELECT ${KEY_COLS} FROM partner_api_keys k WHERE k.id = $1`, [row.id])).rows[0];
    return {
      key: { ...key, masked: maskedKey(k.prefix), active: true },
      secret: k.key,
      note: 'Copy this key now and put it in the billing software. It will not be shown again; if it is lost, revoke it and issue a new one.',
    };
  });
}

export async function revokeKey(partnerId: string, keyId: string, by: Issuer, reason: string | null) {
  return withTransaction(async (c) => {
    // The key must belong to this partner: another partner's key is "not found"
    const cur = (await c.query<{ id: string; prefix: string; revoked_at: string | null }>(
      'SELECT id, prefix, revoked_at FROM partner_api_keys WHERE id = $1 AND partner_id = $2 FOR UPDATE', [keyId, partnerId])).rows[0];
    if (!cur) throw new AppError('Key not found', 404);
    if (cur.revoked_at) throw new AppError('This key was already revoked', 409);
    await c.query('UPDATE partner_api_keys SET revoked_at = NOW(), revoked_by = $2, revoke_reason = $3 WHERE id = $1', [keyId, by.userId, reason]);
    await writeAuditTx(c, { userId: null, action: 'partner_api_key_revoked', performedBy: by.userId,
      newValue: { vendor_id: partnerId, key_id: keyId, prefix: cur.prefix, revoked_as: by.as }, notes: reason });
    const key = (await c.query(`SELECT ${KEY_COLS} FROM partner_api_keys k WHERE k.id = $1`, [keyId])).rows[0];
    return { key: { ...key, masked: maskedKey(cur.prefix), active: false } };
  });
}

export interface FeedCaller { keyId: string; prefix: string; partnerId: string; partnerName: string; scope: KeyScope }

const refuse = async (message: string, status: number, key: { id: string; prefix: string; partner_id: string } | null, reason: string, ip: string | null, path: string) => {
  if (key) {
    // A known key used wrongly is worth a record (C-46): by prefix only
    await writeAudit({ userId: null, action: 'partner_api_key_refused', performedBy: null, ip,
      newValue: { vendor_id: key.partner_id, key_id: key.id, prefix: key.prefix, reason, path } });
  } else {
    logger.warn(`Stock feed: unknown or malformed API key refused (${reason}) from ${ip ?? 'unknown address'}`);
  }
  return new AppError(message, status);
};

/**
 * Checks a presented key for `scope` on `partnerId` (from the URL). Returns the
 * caller, or throws a plain 401 / 403 / 429. The key itself is never logged.
 */
export async function authenticateKey(presented: string | null, partnerId: string, scope: KeyScope, ip: string | null, path: string): Promise<FeedCaller> {
  const prefix = keyPrefix(presented);
  if (!presented || !prefix) throw await refuse('Send the API key as "Authorization: Bearer <key>"', 401, null, 'missing or malformed', ip, path);
  const row = await queryOne<{ id: string; prefix: string; partner_id: string; key_sha256: string; scope: string; revoked_at: string | null;
    vendor_name: string; approval_status: string; is_active: boolean }>(
    `SELECT k.id, k.prefix, k.partner_id, k.key_sha256, k.scope, k.revoked_at, v.name AS vendor_name, v.approval_status, v.is_active
     FROM partner_api_keys k JOIN vendors v ON v.id = k.partner_id WHERE k.prefix = $1`, [prefix]);
  // Always one constant-time comparison, found or not
  const ok = keyMatches(presented, row?.key_sha256);
  if (!row || !ok) throw await refuse('This API key is not valid', 401, null, row ? 'wrong secret' : 'unknown prefix', ip, path);
  if (row.revoked_at) throw await refuse('This API key was revoked. Ask the partner\'s owner or Dawabag for a new one', 401, row, 'revoked', ip, path);
  if (row.partner_id !== partnerId) throw await refuse('This API key belongs to another partner', 403, row, 'wrong partner', ip, path);
  if (row.scope !== scope) throw await refuse('This API key may not do this', 403, row, `scope ${row.scope}`, ip, path);
  if (row.approval_status !== 'approved' || !row.is_active) {
    throw await refuse('This partner account is not active; contact Dawabag', 403, row, 'partner not active', ip, path);
  }
  return { keyId: row.id, prefix: row.prefix, partnerId: row.partner_id, partnerName: row.vendor_name, scope };
}

/** Counts one upload against the key's hourly limit; throws 429 when it is used up. */
export async function takeUploadSlot(caller: FeedCaller, ip: string | null, path: string) {
  const max = hourlyLimit(process.env.STOCK_FEED_MAX_PER_HOUR);
  const k = rateWindowKey(caller.keyId);
  const r = getRedis();
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, 3600);
  if (n > max) {
    throw await refuse(`Too many uploads with this key: at most ${max} an hour. Try again next hour`, 429,
      { id: caller.keyId, prefix: caller.prefix, partner_id: caller.partnerId }, 'rate limited', ip, path);
  }
}

/** Every accepted use, with the import it made (C-46). */
export async function recordKeyUse(caller: FeedCaller, ip: string | null, what: { action: string; import_id?: string; rows?: number }) {
  await query('UPDATE partner_api_keys SET last_used_at = NOW(), use_count = use_count + 1 WHERE id = $1', [caller.keyId]);
  await writeAudit({ userId: null, action: 'partner_api_key_used', performedBy: null, ip,
    newValue: { vendor_id: caller.partnerId, key_id: caller.keyId, prefix: caller.prefix, ...what } });
}
