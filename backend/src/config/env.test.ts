import { checkEnv } from './env';

const strong = 'k'.repeat(40);
const prod = { NODE_ENV: 'production', TRUST_PROXY_HOPS: '1', JWT_ACCESS_SECRET: strong, JWT_REFRESH_SECRET: strong + 'x', DB_PASSWORD: 'S3cure-db-pass',
  CORS_ORIGINS: 'https://dawabag.in', RAZORPAY_KEY_ID: 'rzp_live_1', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w',
  AWS_S3_BUCKET: 'b', MSG91_AUTH_KEY: 'm', MSG91_TEMPLATE_OTP: 't', AWS_SES_FROM_EMAIL: 'noreply@dawabag.in' };

describe('checkEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(checkEnv(prod as NodeJS.ProcessEnv).errors).toEqual([]);
  });

  it('requires TRUST_PROXY_HOPS in production so rate limits see real addresses', () => {
    const { TRUST_PROXY_HOPS, ...rest } = prod;
    expect(checkEnv(rest as any).errors.join(' ')).toMatch(/TRUST_PROXY_HOPS/);
  });
  it('refuses example secrets and missing keys in production', () => {
    const r = checkEnv({ ...prod, JWT_ACCESS_SECRET: 'change_this_to_random_64_char_string_xxxxxxxxx', RAZORPAY_KEY_ID: '' } as NodeJS.ProcessEnv);
    expect(r.errors.join(' ')).toMatch(/JWT_ACCESS_SECRET/);
    expect(r.errors.join(' ')).toMatch(/RAZORPAY_KEY_ID/);
  });
  it('requires data to stay in Mumbai', () => {
    expect(checkEnv({ ...prod, AWS_REGION: 'us-east-1' } as NodeJS.ProcessEnv).errors.join(' ')).toMatch(/ap-south-1/);
  });
  it('only warns about missing integrations in development', () => {
    const r = checkEnv({ NODE_ENV: 'development', JWT_ACCESS_SECRET: strong, JWT_REFRESH_SECRET: strong } as NodeJS.ProcessEnv);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/Not configured/);
  });
  it('refuses test-only provider addresses in production', () => {
    expect(checkEnv({ ...prod, SHIPROCKET_BASE_URL: 'http://127.0.0.1:4890' } as NodeJS.ProcessEnv).errors.join(' ')).toMatch(/SHIPROCKET_BASE_URL/);
  });
  it('refuses the staging template\'s change-me values in production (Sprint 21 review)', () => {
    const r = checkEnv({ ...prod, DB_PASSWORD: 'change-me-long-random',
      JWT_ACCESS_SECRET: 'change-me-at-least-32-random-characters', JWT_REFRESH_SECRET: 'change-me-a-different-32-random-characters' } as NodeJS.ProcessEnv);
    expect(r.errors.join(' ')).toMatch(/JWT_ACCESS_SECRET/);
    expect(r.errors.join(' ')).toMatch(/JWT_REFRESH_SECRET/);
    expect(r.errors.join(' ')).toMatch(/DB_PASSWORD/);
  });
  it('refuses the fake object store in production; another S3 endpoint only on a closed staging stack', () => {
    expect(checkEnv({ ...prod, AWS_S3_BUCKET: 'dawabag-fake-bucket' } as NodeJS.ProcessEnv).errors.join(' ')).toMatch(/AWS_S3_BUCKET/);
    expect(checkEnv({ ...prod, AWS_ACCESS_KEY_ID: 'fake' } as NodeJS.ProcessEnv).errors.join(' ')).toMatch(/AWS_ACCESS_KEY_ID/);
    expect(checkEnv({ ...prod, S3_ENDPOINT: 'http://127.0.0.1:4890' } as NodeJS.ProcessEnv).errors.join(' ')).toMatch(/S3_ENDPOINT/);
    const staging = checkEnv({ ...prod, S3_ENDPOINT: 'https://minio.internal', ALLOW_MISSING_INTEGRATIONS: 'true' } as NodeJS.ProcessEnv);
    expect(staging.errors).toEqual([]);
    expect(staging.warnings.join(' ')).toMatch(/S3_ENDPOINT/);
  });

  // Sprint 24 — the owner's trial server (APP_ENV=trial, deploy/trial)
  describe('APP_ENV', () => {
    const trial = { ...prod, APP_ENV: 'trial', ALLOW_MISSING_INTEGRATIONS: 'true', RAZORPAY_KEY_ID: 'rzp_test_1',
      S3_ENDPOINT: 'http://objectstore:9000', S3_PUBLIC_ENDPOINT: 'https://files.203-0-113-10.sslip.io', AWS_S3_BUCKET: 'dawabag-trial',
      TRIAL_DEMO_PASSWORD: 'Kx7-vQ2m-Lp9r' };
    it('accepts a trial server with its own object store, warning about it', () => {
      const r = checkEnv(trial as NodeJS.ProcessEnv);
      expect(r.errors).toEqual([]);
      expect(r.warnings.join(' ')).toMatch(/S3_ENDPOINT/);
    });
    it('refuses a trial that is not closed or takes live payments', () => {
      expect(checkEnv({ ...trial, ALLOW_MISSING_INTEGRATIONS: undefined } as any).errors.join(' ')).toMatch(/APP_ENV=trial needs ALLOW_MISSING_INTEGRATIONS/);
      expect(checkEnv({ ...trial, RAZORPAY_KEY_ID: 'rzp_live_X' } as any).errors.join(' ')).toMatch(/test keys/);
    });
    it('real production (APP_ENV=production) refuses the trial object store and trial-only settings outright', () => {
      const real = { ...prod, APP_ENV: 'production' };
      expect(checkEnv(real as NodeJS.ProcessEnv).errors).toEqual([]);
      expect(checkEnv({ ...real, S3_ENDPOINT: 'http://objectstore:9000', ALLOW_MISSING_INTEGRATIONS: 'true' } as any).errors.join(' ')).toMatch(/S3_ENDPOINT/);
      expect(checkEnv({ ...real, ALLOW_MISSING_INTEGRATIONS: 'true' } as any).errors.join(' ')).toMatch(/ALLOW_MISSING_INTEGRATIONS/);
      expect(checkEnv({ ...real, DEMO_SEED: 'true' } as any).errors.join(' ')).toMatch(/DEMO_SEED/);
      expect(checkEnv({ ...real, TRIAL_DEMO_PASSWORD: 'x'.repeat(12) } as any).errors.join(' ')).toMatch(/TRIAL_DEMO_PASSWORD/);
    });
    it('keeps refusing demo settings when APP_ENV is unset (staging rules unchanged)', () => {
      expect(checkEnv({ ...prod, DEMO_SEED: 'true' } as any).errors.join(' ')).toMatch(/DEMO_SEED/);
      expect(checkEnv({ ...prod, TRIAL_DEMO_PASSWORD: 'x'.repeat(12) } as any).errors.join(' ')).toMatch(/TRIAL_DEMO_PASSWORD/);
      expect(checkEnv({ ...prod, S3_ENDPOINT: 'http://127.0.0.1:4890' } as any).errors.join(' ')).toMatch(/S3_ENDPOINT/);
    });
    it('refuses an unknown APP_ENV', () => {
      expect(checkEnv({ ...prod, APP_ENV: 'demo' } as any).errors.join(' ')).toMatch(/APP_ENV must be one of/);
    });
    it('S3_PUBLIC_ENDPOINT only with an S3-compatible store, and only https', () => {
      expect(checkEnv({ ...trial, S3_ENDPOINT: undefined } as any).errors.join(' ')).toMatch(/S3_PUBLIC_ENDPOINT is only/);
      expect(checkEnv({ ...trial, S3_PUBLIC_ENDPOINT: 'http://files.example.in' } as any).errors.join(' ')).toMatch(/https/);
    });
  });
});
