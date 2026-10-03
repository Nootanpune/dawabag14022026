// Time-based one-time passwords (RFC 6238, on HOTP — RFC 4226) for two-step sign-in with an
// authenticator app (Sprint 42; C-41, C-43). What the apps use: HMAC-SHA-1, 30-second steps,
// 6 digits; a code from the step before or after is accepted (clock drift, ±1 step). The
// hash, digits and step are parameters so the RFC's own test vectors (SHA-1 / SHA-256 /
// SHA-512, 8 digits) can be checked (totp.test.ts). Pure functions, no I/O.
import crypto from 'crypto';

export type TotpAlgorithm = 'sha1' | 'sha256' | 'sha512';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
/** 160-bit secret, as RFC 4226 recommends and authenticator apps expect. */
export const SECRET_BYTES = 20;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding (what otpauth:// URIs carry). */
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('Not a base32 secret');
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226 §5.3): dynamic truncation of HMAC(key, 8-byte counter). */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: TotpAlgorithm = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The 30-second step number at a time (ms since the epoch). */
export const stepAt = (ms: number, stepSeconds = TOTP_STEP_SECONDS) => Math.floor(ms / 1000 / stepSeconds);

/** TOTP (RFC 6238 §4): HOTP of the step number. */
export function totp(key: Buffer, ms: number, o: { digits?: number; algorithm?: TotpAlgorithm; stepSeconds?: number } = {}): string {
  return hotp(key, stepAt(ms, o.stepSeconds), o.digits ?? TOTP_DIGITS, o.algorithm ?? 'sha1');
}

/**
 * The step a code belongs to, if it is the code of the current step or one either side;
 * else null. Every candidate is compared in constant time. The caller refuses a step that
 * was already used (replay protection: each code works once).
 */
export function matchTotp(key: Buffer, code: string, ms: number, window = TOTP_WINDOW): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(ms);
  let hit: number | null = null;
  for (let d = -window; d <= window; d++) {
    const expected = Buffer.from(hotp(key, now + d));
    if (crypto.timingSafeEqual(expected, Buffer.from(code)) && hit === null) hit = now + d;
  }
  return hit;
}

export const generateSecret = () => crypto.randomBytes(SECRET_BYTES);

/** otpauth://totp/… — what the QR code holds (Google Authenticator key-URI format). */
export function otpauthUri(secret: Buffer, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  // %20, not '+', for spaces: authenticator apps show '+' literally
  const q = Object.entries({ secret: base32Encode(secret), issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `otpauth://totp/${label}?${q}`;
}
