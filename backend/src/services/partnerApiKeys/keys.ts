// Sprint 36 — partner API keys for the stock feed: making, reading and checking a
// key. Pure (no I/O); unit-tested.
//   Format:  dwbk_<prefix>_<secret>
//     prefix  10 lowercase letters / digits — public, shown in lists and audit
//             entries, used only to find the key's row
//     secret  32 random bytes, base64url (43 characters) — shown once, never stored
//   Stored:  the prefix and SHA-256 of the whole key. The secret has 256 bits of
//            randomness, so a fast hash is enough (no password stretching needed);
//            comparison is constant-time (C-44).
import crypto from 'crypto';

export const KEY_SCHEME = 'dwbk';
const KEY_RE = /^dwbk_([a-z0-9]{10})_([A-Za-z0-9_-]{43})$/;
const PREFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';   // no 0 / o / 1 / l: easy to read aloud

export interface NewKey { key: string; prefix: string; sha256: string }

export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/** A new random key. The caller shows `key` once and stores only `prefix` and `sha256`. */
export function generateKey(): NewKey {
  const bytes = crypto.randomBytes(10);
  const prefix = Array.from(bytes, (b) => PREFIX_ALPHABET[b % PREFIX_ALPHABET.length]).join('');
  const secret = crypto.randomBytes(32).toString('base64url');
  const key = `${KEY_SCHEME}_${prefix}_${secret}`;
  return { key, prefix, sha256: hashKey(key) };
}

/** The prefix of a well-formed key, or null. Never echoes the key back. */
export function keyPrefix(presented: string | null | undefined): string | null {
  const m = KEY_RE.exec(String(presented ?? '').trim());
  return m ? m[1] : null;
}

/** The key from an "Authorization: Bearer <key>" header, or null. Keys in URLs are never accepted. */
export function keyFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

// Compared against when no row has the prefix, so an unknown key costs the same work
const DUMMY_SHA = hashKey(`${KEY_SCHEME}_unknown`);

/** Constant-time check of a presented key against the stored hash (or a dummy when none). */
export function keyMatches(presented: string, storedSha256: string | null | undefined): boolean {
  const a = Buffer.from(hashKey(presented), 'hex');
  const stored = storedSha256 && /^[0-9a-f]{64}$/.test(storedSha256) ? storedSha256 : DUMMY_SHA;
  const b = Buffer.from(stored, 'hex');
  return crypto.timingSafeEqual(a, b) && !!storedSha256;
}

/** "dwbk_ab12cd34ef_…" — how a key is named on screens and in logs (never the secret). */
export const maskedKey = (prefix: string) => `${KEY_SCHEME}_${prefix}_…`;

export const LABEL_MIN = 2;
export const LABEL_MAX = 80;
/** Active keys one partner may hold at a time (one per billing PC, plus a spare). */
export const MAX_ACTIVE_KEYS = 5;

export function labelProblems(raw: string | null | undefined): string[] {
  const label = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (label.length < LABEL_MIN) return ['Name the key (e.g. "Billing PC, counter 1")'];
  if (label.length > LABEL_MAX) return [`Keep the name to ${LABEL_MAX} characters`];
  return [];
}

/** Uploads one key may make per hour (env STOCK_FEED_MAX_PER_HOUR; default 20). */
export function hourlyLimit(env: string | undefined): number {
  const n = Number.parseInt(env ?? '', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 20;
}

/** The Redis counter for a key in the current hour (fixed window). */
export function rateWindowKey(keyId: string, now = new Date()): string {
  return `stockfeed:rl:${keyId}:${now.toISOString().slice(0, 13)}`;
}
