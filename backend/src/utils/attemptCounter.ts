// src/utils/attemptCounter.ts — counts attempts at a secret (a sign-in code, an authenticator
// code, a password re-entered to sign) ATOMICALLY in Redis, BEFORE the guess is checked.
//
// Sprint 48 (security review 41–47 #4, C-41, C-44): the earlier limits read the count, checked
// the guess and only then counted a wrong one. Requests sent in parallel all read the same
// count, so "five wrong codes" could become hundreds of guesses in one window. Now each try
// takes its number first (INCR, and the window's expiry set in the same script, so a counter
// can never be left without an expiry); a try whose number is over the limit is refused
// without being checked. A right answer clears the counter.
import type { Redis } from 'ioredis';

/** INCR + EXPIRE (only when the key is new) in one step; returns this attempt's number. */
export const TAKE_ATTEMPT_SCRIPT = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return n`;

export async function takeAttempt(redis: Pick<Redis, 'eval'>, key: string, windowSeconds: number): Promise<number> {
  return Number(await redis.eval(TAKE_ATTEMPT_SCRIPT, 1, key, String(windowSeconds)));
}

/** Attempts used in the current window (0 when none). */
export async function attemptsUsed(redis: Pick<Redis, 'get'>, key: string): Promise<number> {
  return Number((await redis.get(key)) ?? 0);
}
