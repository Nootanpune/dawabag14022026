// Sprint 42 — authenticator secrets encrypted (AES-256-GCM, bound to the user) and recovery codes hashed with a key.
import { decryptSecret, encryptSecret, generateRecoveryCodes, hashRecoveryCode, keyMaterial, looksLikeRecoveryCode, normaliseRecoveryCode } from './keys';

const envA = { TOTP_ENC_KEY: 'a'.repeat(40), JWT_REFRESH_SECRET: 'r'.repeat(40) } as NodeJS.ProcessEnv;
const envB = { TOTP_ENC_KEY: 'b'.repeat(40), JWT_REFRESH_SECRET: 'r'.repeat(40) } as NodeJS.ProcessEnv;
const secret = Buffer.from('12345678901234567890');

describe('secret encryption', () => {
  it('round-trips, and every encryption differs (fresh IV)', () => {
    const one = encryptSecret('user-1', secret, envA);
    const two = encryptSecret('user-1', secret, envA);
    expect(one).not.toBe(two);
    expect(one.startsWith('v1.')).toBe(true);
    expect(one).not.toContain(secret.toString('base64'));
    expect(decryptSecret('user-1', one, envA).equals(secret)).toBe(true);
  });
  it('refuses another user, another key and changed bytes', () => {
    const blob = encryptSecret('user-1', secret, envA);
    expect(() => decryptSecret('user-2', blob, envA)).toThrow();
    expect(() => decryptSecret('user-1', blob, envB)).toThrow();
    const raw = Buffer.from(blob.slice(3), 'base64url'); raw[raw.length - 1] ^= 1;
    expect(() => decryptSecret('user-1', `v1.${raw.toString('base64url')}`, envA)).toThrow();
  });
  it('without TOTP_ENC_KEY derives a key from JWT_REFRESH_SECRET (a different key), and needs one of them', () => {
    expect(keyMaterial(envA).source).toBe('env');
    const derived = { JWT_REFRESH_SECRET: 'r'.repeat(40) } as NodeJS.ProcessEnv;
    expect(keyMaterial(derived).source).toBe('derived');
    expect(() => decryptSecret('user-1', encryptSecret('user-1', secret, envA), derived)).toThrow();
    expect(() => keyMaterial({} as NodeJS.ProcessEnv)).toThrow(/TOTP_ENC_KEY/);
  });
});

describe('recovery codes', () => {
  it('ten different codes, xxxxx-xxxxx, no look-alike characters', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
  });
  it('hash is keyed and ignores case, spaces and dashes', () => {
    const [c] = generateRecoveryCodes(1);
    expect(hashRecoveryCode(c, envA)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(c.toUpperCase().replace('-', ' '), envA)).toBe(hashRecoveryCode(c, envA));
    expect(hashRecoveryCode(c, envB)).not.toBe(hashRecoveryCode(c, envA));
    expect(normaliseRecoveryCode(' AbCdE-fGhJk ')).toBe('abcdefghjk');
    expect(looksLikeRecoveryCode('abcde-fghjk')).toBe(true);
    expect(looksLikeRecoveryCode('123456')).toBe(false);
  });
});
