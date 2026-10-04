// The step between the password (or SMS code) and the authenticator code (Sprint 42). A
// random, single-use challenge token names the login that passed the first step; it lives
// only in Redis on the server (a SHA-256 of it is the key) for a few minutes. No tokens,
// no cookie until the second step succeeds. Wrong codes are counted per login.
import crypto from 'crypto';
import { getRedis } from '../../config/redis';
import { takeAttempt } from '../../utils/attemptCounter';
import { CODE_CHALLENGE_SECONDS, ENROL_CHALLENGE_SECONDS, MAX_WRONG_CODES, WRONG_CODE_WINDOW_SECONDS } from './policy';

export type ChallengePurpose = 'code' | 'enrol';
/** How the first step was passed (recorded in the audit log). */
export type FirstStep = 'password' | 'sms_code' | 'password_reset';

export interface Challenge { userId: string; purpose: ChallengePurpose; via: FirstStep; createdAt: number }

const key = (token: string) => `2fa_ch:${crypto.createHash('sha256').update(String(token)).digest('hex')}`;
const wrongKey = (userId: string) => `2fa_wrong:${userId}`;

export async function createChallenge(userId: string, purpose: ChallengePurpose, via: FirstStep): Promise<{ token: string; expiresIn: number }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresIn = purpose === 'enrol' ? ENROL_CHALLENGE_SECONDS : CODE_CHALLENGE_SECONDS;
  const c: Challenge = { userId, purpose, via, createdAt: Date.now() };
  await getRedis().set(key(token), JSON.stringify(c), 'EX', expiresIn);
  return { token, expiresIn };
}

export async function readChallenge(token: string): Promise<Challenge | null> {
  if (!token || token.length > 200) return null;
  const raw = await getRedis().get(key(token));
  return raw ? (JSON.parse(raw) as Challenge) : null;
}

// GET + DEL in one step: only one request can ever use a challenge
const TAKE = `local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v`;
export async function takeChallenge(token: string): Promise<Challenge | null> {
  const raw = (await getRedis().eval(TAKE, 1, key(token))) as string | null;
  return raw ? (JSON.parse(raw) as Challenge) : null;
}

export const dropChallenge = (token: string) => getRedis().del(key(token));

/** Wrong codes in the current window (0 when none). */
export async function wrongCodes(userId: string): Promise<number> {
  return Number((await getRedis().get(wrongKey(userId))) ?? 0);
}
export const isPaused = async (userId: string) => (await wrongCodes(userId)) >= MAX_WRONG_CODES;

/**
 * Sprint 48 (security review 41–47 #4): takes this try's number BEFORE the code is checked
 * (INCR + window expiry in one Redis step). A try over MAX_WRONG_CODES is refused unchecked;
 * a right code clears the count. Parallel tries can no longer all pass a "fewer than five
 * wrong" check before any of them is counted.
 */
export const takeCodeAttempt = (userId: string) => takeAttempt(getRedis(), wrongKey(userId), WRONG_CODE_WINDOW_SECONDS);
export const pauseLeftSeconds = async (userId: string) => Math.max(1, await getRedis().ttl(wrongKey(userId)));
export const clearWrongCodes = (userId: string) => getRedis().del(wrongKey(userId));
