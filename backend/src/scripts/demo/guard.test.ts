import { demoSeedRefusal, parseMode } from './guard';

const ok = { APP_ENV: 'trial', DEMO_SEED: 'true', TRIAL_DEMO_PASSWORD: 'Kx7-vQ2m-Lp9r' } as NodeJS.ProcessEnv;

describe('demo seed guard', () => {
  it('runs only on a trial server with DEMO_SEED=true and a strong password', () => {
    expect(demoSeedRefusal(ok)).toBeNull();
  });
  it('refuses production, staging and an unset APP_ENV', () => {
    for (const APP_ENV of ['production', 'staging', undefined, 'TRIAL']) {
      expect(demoSeedRefusal({ ...ok, APP_ENV, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toMatch(/APP_ENV=trial/);
    }
  });
  it('refuses a trial server unless DEMO_SEED=true for the run', () => {
    expect(demoSeedRefusal({ ...ok, DEMO_SEED: undefined } as NodeJS.ProcessEnv)).toMatch(/DEMO_SEED/);
    expect(demoSeedRefusal({ ...ok, DEMO_SEED: '1' } as NodeJS.ProcessEnv)).toMatch(/DEMO_SEED/);
  });
  it('refuses a missing, short or obvious demo password', () => {
    expect(demoSeedRefusal({ ...ok, TRIAL_DEMO_PASSWORD: undefined } as NodeJS.ProcessEnv)).toMatch(/TRIAL_DEMO_PASSWORD/);
    expect(demoSeedRefusal({ ...ok, TRIAL_DEMO_PASSWORD: 'short1' } as NodeJS.ProcessEnv)).toMatch(/at least 10/);
    expect(demoSeedRefusal({ ...ok, TRIAL_DEMO_PASSWORD: 'Password12345' } as NodeJS.ProcessEnv)).toMatch(/guess/);
  });
  it('removal needs the same trial confirmation but no password', () => {
    expect(demoSeedRefusal({ APP_ENV: 'trial', DEMO_SEED: 'true' } as NodeJS.ProcessEnv, 'remove')).toBeNull();
    expect(demoSeedRefusal({ APP_ENV: 'production', DEMO_SEED: 'true' } as NodeJS.ProcessEnv, 'remove')).toMatch(/APP_ENV=trial/);
  });
  it('reads --remove and rejects anything else', () => {
    expect(parseMode([])).toBe('seed');
    expect(parseMode(['--remove'])).toBe('remove');
    expect(() => parseMode(['--force'])).toThrow(/Unknown/);
  });
});
