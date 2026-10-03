// One-time codes sent by SMS (sign-up, sign-in by code, "Forgot password") — Sprint 41
// security review #1, #2, #9 (C-41, C-44):
//   * codes come from the operating system's random source (crypto.randomInt), never
//     Math.random — since Sprint 35 a code can also set a new password;
//   * every check counts wrong codes per mobile, whichever endpoint is used
//     (/auth/verify-otp or /auth/reset-password): after OTP_MAX_WRONG (5) the code is
//     thrown away and a new one must be asked for;
//   * sending is limited per mobile (one code every OTP_SEND_MIN_GAP_SECONDS, default 30,
//     and OTP_SENDS_PER_HOUR, default 5) — counted before anyone looks up whether the
//     mobile has an account, so the limit reveals nothing either (no SMS flooding of a
//     stranger's phone, no SMS bill run up through the "Forgot password" form).
// Codes and counters live only in Redis with an expiry (server-side; nothing on devices).
import crypto from 'crypto';
import { getRedis } from '../../config/redis';
import { AppError } from '../../utils/AppError';

export const OTP_MAX_WRONG = 5;
const WRONG_WINDOW_S = 15 * 60;

const intEnv = (name: string, fallback: number, min: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= min ? n : fallback;
};
export const otpSendLimits = () => ({
  minGapSeconds: intEnv('OTP_SEND_MIN_GAP_SECONDS', 30, 0),
  perHour: intEnv('OTP_SENDS_PER_HOUR', 5, 1),
});

/** A six-digit code from the OS random source. */
export const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

export const OTP_SEND_LIMIT = 'OTP_SEND_LIMIT';
export const otpSendLimitError = (retryAfterS: number) => new AppError(
  `Too many codes asked for this number. Please wait ${retryAfterS >= 120 ? `${Math.ceil(retryAfterS / 60)} minutes` : `${retryAfterS} seconds`} and try again.`,
  429, true, OTP_SEND_LIMIT);

/**
 * Takes one send slot for this mobile, or says how long to wait. Called for every
 * request that would send a code, whether or not the mobile has an account.
 */
export async function takeOtpSendSlot(mobile: string): Promise<{ ok: true } | { ok: false; retryAfterS: number }> {
  const r = getRedis();
  const { minGapSeconds, perHour } = otpSendLimits();
  if (minGapSeconds > 0) {
    const fresh = await r.set(`otp_gap:${mobile}`, '1', 'EX', minGapSeconds, 'NX');
    if (fresh === null) return { ok: false, retryAfterS: Math.max(1, await r.ttl(`otp_gap:${mobile}`)) };
  }
  const key = `otp_sends:${mobile}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, 3600);
  if (n > perHour) return { ok: false, retryAfterS: Math.max(1, await r.ttl(key)) };
  return { ok: true };
}

/** Stores a fresh code for this mobile (replacing any earlier one) and returns it. */
export async function storeNewOtp(mobile: string): Promise<string> {
  const otp = generateOtp();
  const expiry = parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60;
  await getRedis().set(`otp:${mobile}`, otp, 'EX', expiry);
  return otp;
}

export type OtpCheck = 'ok' | 'wrong' | 'too_many';

/**
 * Checks (and on success uses up) the mobile's code. Wrong codes are counted per mobile
 * for every caller; the fifth wrong one throws the code away.
 */
export async function checkOtp(mobile: string, otp: string): Promise<OtpCheck> {
  const r = getRedis();
  const key = `otp:${mobile}`, wrongKey = `otp_wrong:${mobile}`;
  const stored = await r.get(key);
  const a = Buffer.from(String(stored ?? '')), b = Buffer.from(String(otp));
  const match = !!stored && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (match) {
    // Used once: a second request with the same code finds nothing
    const used = await r.del(key);
    if (used === 1) { await r.del(wrongKey); return 'ok'; }
  }
  const wrong = await r.incr(wrongKey);
  if (wrong === 1) await r.expire(wrongKey, WRONG_WINDOW_S);
  if (wrong >= OTP_MAX_WRONG) {
    await r.del(key);
    await r.del(wrongKey);
    return 'too_many';
  }
  return 'wrong';
}

export const TOO_MANY_WRONG_CODES = 'Too many wrong codes. Ask for a new code.';
