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
});
