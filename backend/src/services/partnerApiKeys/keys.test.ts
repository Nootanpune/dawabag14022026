// Sprint 36 — partner API keys: format, hashing, constant-time check, header parsing.
import fs from 'fs';
import path from 'path';
import { generateKey, hashKey, hourlyLimit, keyFromHeader, keyMatches, keyPrefix, labelProblems, maskedKey, rateWindowKey, snapshotHourlyLimit } from './keys';

describe('partner API keys', () => {
  it('a new key has the scheme, a 10-character prefix and a 43-character secret; only its hash is returned for storage', () => {
    const k = generateKey();
    expect(k.key).toMatch(/^dwbk_[a-z0-9]{10}_[A-Za-z0-9_-]{43}$/);
    expect(keyPrefix(k.key)).toBe(k.prefix);
    expect(k.sha256).toBe(hashKey(k.key));
    expect(k.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(k.sha256).not.toContain(k.key.split('_').pop());
  });

  it('keys are different every time', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateKey().key));
    expect(seen.size).toBe(200);
  });

  it('matches only the exact key', () => {
    const k = generateKey();
    expect(keyMatches(k.key, k.sha256)).toBe(true);
    const flipped = k.key.slice(0, -1) + (k.key.endsWith('A') ? 'B' : 'A');
    expect(keyMatches(flipped, k.sha256)).toBe(false);
    expect(keyMatches(k.key, generateKey().sha256)).toBe(false);
  });

  it('an unknown prefix (no stored hash) never matches, but is still compared', () => {
    const k = generateKey();
    expect(keyMatches(k.key, null)).toBe(false);
    expect(keyMatches(k.key, 'not-a-hash')).toBe(false);
  });

  it('the comparison is constant-time (crypto.timingSafeEqual), never ===', () => {
    const src = fs.readFileSync(path.join(__dirname, 'keys.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function keyMatches'));
    expect(fn.split('\n}')[0]).toMatch(/timingSafeEqual/);
  });

  it('reads the key only from "Authorization: Bearer"', () => {
    expect(keyFromHeader('Bearer dwbk_abcdefghij_x')).toBe('dwbk_abcdefghij_x');
    expect(keyFromHeader('bearer   abc  ')).toBe('abc');
    expect(keyFromHeader('Basic abc')).toBeNull();
    expect(keyFromHeader(undefined)).toBeNull();
  });

  it('malformed keys have no prefix', () => {
    expect(keyPrefix('dwbk_short_abc')).toBeNull();
    expect(keyPrefix('')).toBeNull();
    expect(keyPrefix(null)).toBeNull();
  });

  it('a masked key shows the prefix only', () => {
    expect(maskedKey('abcdefghij')).toBe('dwbk_abcdefghij_…');
  });

  it('labels are required and short', () => {
    expect(labelProblems('Billing PC')).toEqual([]);
    expect(labelProblems(' ')).toHaveLength(1);
    expect(labelProblems('x'.repeat(81))).toHaveLength(1);
  });

  it('hourly limit: default 20, from the environment when valid', () => {
    expect(hourlyLimit(undefined)).toBe(20);
    expect(hourlyLimit('abc')).toBe(20);
    expect(hourlyLimit('0')).toBe(20);
    expect(hourlyLimit('5')).toBe(5);
  });

  it('the rate window is per key per hour', () => {
    const d = new Date('2026-10-03T10:59:59Z');
    expect(rateWindowKey('k1', d)).toBe('stockfeed:rl:k1:2026-10-03T10');
    expect(rateWindowKey('k1', new Date('2026-10-03T11:00:00Z'))).not.toBe(rateWindowKey('k1', d));
  });

  it('Sprint 37: live snapshots have their own window and allowance (default 120 an hour)', () => {
    const d = new Date('2026-10-03T10:59:59Z');
    expect(rateWindowKey('k1', d, 'snapshot')).toBe('stockfeed:live:k1:2026-10-03T10');
    expect(snapshotHourlyLimit(undefined)).toBe(120);
    expect(snapshotHourlyLimit('300')).toBe(300);
  });
});
