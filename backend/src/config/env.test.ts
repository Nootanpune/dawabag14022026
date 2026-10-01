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
});
