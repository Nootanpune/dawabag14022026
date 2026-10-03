// Encryption of authenticator secrets and hashing of recovery codes (Sprint 42; C-41, C-43).
//
// Key: TOTP_ENC_KEY from the server's environment (32+ random characters; never in the
// database or the repository). Two sub-keys are derived from it with HKDF-SHA-256 — one
// encrypts the secrets (AES-256-GCM, the user id bound in as associated data so a secret
// copied to another account does not decrypt), one keys the HMAC of recovery codes (a copy
// of the database alone cannot be used to guess them).
// Without TOTP_ENC_KEY: APP_ENV=production refuses to start (config/env.ts). Elsewhere
// (development, CI, a staging stack) the key is derived from JWT_REFRESH_SECRET and the
// admin dashboard warns (TOTP_KEY_NOT_SET); the trial server derives a stable TOTP_ENC_KEY
// itself (deploy/trial/trial.sh). Changing the key makes existing enrolments unreadable:
// people then sign in with a recovery code, or a super-admin resets their two-step sign-in.
import crypto from 'crypto';

export type KeySource = 'env' | 'derived';

/** The key material and where it came from; throws when there is nothing to derive it from. */
export function keyMaterial(env: NodeJS.ProcessEnv = process.env): { ikm: Buffer; source: KeySource } {
  const configured = String(env.TOTP_ENC_KEY ?? '').trim();
  if (configured) return { ikm: Buffer.from(configured, 'utf8'), source: 'env' };
  const fallback = String(env.JWT_REFRESH_SECRET ?? '');
  if (!fallback) throw new Error('TOTP_ENC_KEY is not set and there is no JWT_REFRESH_SECRET to derive it from');
  return { ikm: Buffer.from(`dawabag-totp-fallback:${fallback}`, 'utf8'), source: 'derived' };
}

const subKey = (info: string, env?: NodeJS.ProcessEnv) =>
  Buffer.from(crypto.hkdfSync('sha256', keyMaterial(env).ikm, Buffer.from('dawabag-two-factor'), Buffer.from(info), 32));

const VERSION = 'v1';

/** "v1.<base64url(iv | tag | ciphertext)>" */
export function encryptSecret(userId: string, secret: Buffer, env?: NodeJS.ProcessEnv): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', subKey('totp-secret-v1', env), iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(secret), c.final()]);
  return `${VERSION}.${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')}`;
}

/** The secret, or throws (wrong key, wrong user, changed bytes). */
export function decryptSecret(userId: string, blob: string, env?: NodeJS.ProcessEnv): Buffer {
  const [v, body] = String(blob).split('.');
  if (v !== VERSION || !body) throw new Error('Unknown secret format');
  const raw = Buffer.from(body, 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', subKey('totp-secret-v1', env), raw.subarray(0, 12));
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}

// Recovery codes: 10 characters from an alphabet without look-alikes, shown as xxxxx-xxxxx
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // 31 symbols → ~49.5 bits per code
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(n = RECOVERY_CODE_COUNT): string[] {
  const out = new Set<string>();
  while (out.size < n) {
    let s = '';
    for (let i = 0; i < 10; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    out.add(`${s.slice(0, 5)}-${s.slice(5)}`);
  }
  return [...out];
}

/** Lower case, no spaces or dashes: "ABCDE-FGHJK" and "abcde fghjk" are the same code. */
export const normaliseRecoveryCode = (code: string) => String(code).toLowerCase().replace(/[^a-z0-9]/g, '');
export const looksLikeRecoveryCode = (code: string) => /^[a-z0-9]{10}$/.test(normaliseRecoveryCode(code));

/** Keyed hash stored in user_recovery_codes.code_hash (64 hex characters). */
export function hashRecoveryCode(code: string, env?: NodeJS.ProcessEnv): string {
  return crypto.createHmac('sha256', subKey('recovery-code-v1', env)).update(normaliseRecoveryCode(code)).digest('hex');
}
