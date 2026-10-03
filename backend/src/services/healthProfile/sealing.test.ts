import { healthAad, healthKeys, HealthUnreadable, memberHealth, openHealth, profileHealth, sealedWithOldKey, sealHealth, sealMember } from './sealing';

const K1 = { NODE_ENV: 'production', HEALTH_ENC_KEY: 'a'.repeat(40) } as NodeJS.ProcessEnv;
const K2 = { NODE_ENV: 'production', HEALTH_ENC_KEY: 'b'.repeat(40) } as NodeJS.ProcessEnv;
const ROTATING = { ...K2, HEALTH_ENC_KEY_PREVIOUS: 'a'.repeat(40) } as NodeJS.ProcessEnv;

describe('health sealing (Sprint 43, C-41)', () => {
  const aad = healthAad('health_profiles', '11111111-1111-1111-1111-111111111111');
  const value = { allergies: ['Penicillin'], conditions: ['Asthma'], current_medicines: [] };

  it('round-trips and never shows the plain text', () => {
    const blob = sealHealth(aad, value, K1);
    expect(blob).toMatch(/^h1\.[0-9a-f]{8}\./);
    expect(blob).not.toContain('Penicillin');
    expect(openHealth(aad, blob, K1)).toEqual(value);
  });

  it('a fresh IV every time', () => {
    expect(sealHealth(aad, value, K1)).not.toEqual(sealHealth(aad, value, K1));
  });

  it('does not open for another row, another key or changed bytes', () => {
    const blob = sealHealth(aad, value, K1);
    expect(() => openHealth(healthAad('health_profiles', 'other'), blob, K1)).toThrow(HealthUnreadable);
    expect(() => openHealth(aad, blob, K2)).toThrow(HealthUnreadable);
    const parts = blob.split('.');
    const bytes = Buffer.from(parts[2], 'base64url'); bytes[bytes.length - 1] ^= 1;
    expect(() => openHealth(aad, `${parts[0]}.${parts[1]}.${bytes.toString('base64url')}`, K1)).toThrow(HealthUnreadable);
  });

  it('key rotation: the previous key still opens, and the value is flagged for re-sealing', () => {
    const old = sealHealth(aad, value, K1);
    expect(openHealth(aad, old, ROTATING)).toEqual(value);
    expect(sealedWithOldKey(old, ROTATING)).toBe(true);
    expect(sealedWithOldKey(sealHealth(aad, value, ROTATING), ROTATING)).toBe(false);
  });

  it('key sources: env, development fixed key, production fallback', () => {
    expect(healthKeys(K1).source).toBe('env');
    expect(healthKeys({ NODE_ENV: 'development' } as NodeJS.ProcessEnv).source).toBe('development');
    expect(healthKeys({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).current.id).toEqual(healthKeys({ NODE_ENV: 'development' } as NodeJS.ProcessEnv).current.id);
    expect(healthKeys({ NODE_ENV: 'production', JWT_REFRESH_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv).source).toBe('derived');
    expect(() => healthKeys({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/HEALTH_ENC_KEY/);
  });

  it('rows: sealed value first, legacy plain columns otherwise', () => {
    expect(profileHealth(null)).toEqual({ allergies: [], conditions: [], current_medicines: [] });
    expect(profileHealth({ user_id: 'u', allergies: ['Dust'], conditions: [], current_medicines: ['X'] }))
      .toEqual({ allergies: ['Dust'], conditions: [], current_medicines: ['X'] });
    const id = '22222222-2222-2222-2222-222222222222';
    expect(sealMember(id, { allergies: [], conditions: [] })).toBeNull();
    const sealed = sealMember(id, { allergies: ['Sulfa'], conditions: [] })!;
    expect(memberHealth({ id, health_sealed: sealed, allergies: [], conditions: [] })).toEqual({ allergies: ['Sulfa'], conditions: [] });
  });
});
