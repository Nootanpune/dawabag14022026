// src/config/env.ts — configuration is checked once at start-up, so a missing or
// weak setting stops the server instead of failing on a customer's request.
// Production refuses placeholder secrets and missing payment/SMS/storage keys
// (set ALLOW_MISSING_INTEGRATIONS=true only for a closed staging environment).
// APP_ENV names the deployment: unset (staging rules, as before), 'staging',
// 'trial' (the owner's throwaway demo server, deploy/trial/TRIAL.md) or
// 'production'. Trial-only behaviour (demo seed, a self-hosted object store) is
// refused unless APP_ENV=trial, and APP_ENV=production refuses it outright. The demo
// payment (DEMO_PAYMENTS, payments/paymentMode.ts) likewise exists only with APP_ENV=trial.
import { z } from 'zod';

export const APP_ENVS = ['development', 'test', 'staging', 'trial', 'production'] as const;
export type AppEnv = typeof APP_ENVS[number];
/** The owner's demo server: demo data and placeholder legal details, never real customers. */
export const isTrial = (env: NodeJS.ProcessEnv = process.env) => env.APP_ENV === 'trial';

// Also the staging template's "change-me-…" values (deploy/staging/staging.env.example):
// a stack started from the template unchanged would sign tokens with a published key
const PLACEHOLDER = /change[-_ ]?(this|me)|your_|example|placeholder/i;
const secret = (name: string) => z.string({ required_error: `${name} is required` })
  .min(32, `${name} must be at least 32 characters`)
  .refine((v) => !PLACEHOLDER.test(v), `${name} still has the example value`);

const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_HOST: z.string().default('localhost'),
  DB_NAME: z.string().default('dawabag'),
  DB_USER: z.string().default('dawabag_user'),
  DB_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string({ required_error: 'JWT_ACCESS_SECRET is required' }).min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string({ required_error: 'JWT_REFRESH_SECRET is required' }).min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
});

const INTEGRATIONS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'AWS_S3_BUCKET',
  'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_OTP', 'AWS_SES_FROM_EMAIL'] as const;

export interface EnvCheck { errors: string[]; warnings: string[] }

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = base.safeParse(env);
  if (!parsed.success) errors.push(...parsed.error.issues.map((i) => i.message));
  const production = env.NODE_ENV === 'production';
  const appEnv = env.APP_ENV;
  if (appEnv && !(APP_ENVS as readonly string[]).includes(appEnv)) errors.push(`APP_ENV must be one of ${APP_ENVS.join(', ')}`);
  // Real production: every integration real, no other object store, nothing trial-only
  const realProduction = production && appEnv === 'production';
  const trial = appEnv === 'trial';
  if (realProduction && env.ALLOW_MISSING_INTEGRATIONS === 'true') errors.push('ALLOW_MISSING_INTEGRATIONS must not be set when APP_ENV=production');
  if (trial) {
    // A trial is a closed demo: placeholder licences (C-04) and demo stock, so it must
    // never take real money — Razorpay test keys only (rzp_test_…)
    if (env.ALLOW_MISSING_INTEGRATIONS !== 'true') errors.push('APP_ENV=trial needs ALLOW_MISSING_INTEGRATIONS=true (a closed trial, not production)');
    if (/^rzp_live_/.test(String(env.RAZORPAY_KEY_ID ?? ''))) errors.push('APP_ENV=trial must use Razorpay test keys (rzp_test_…), never live keys');
    // Demo payment (Sprint 26): on by default in a trial without Razorpay keys; DEMO_PAYMENTS=false turns it off
    if (env.DEMO_PAYMENTS != null && !['true', 'false'].includes(env.DEMO_PAYMENTS)) errors.push('DEMO_PAYMENTS must be true or false');
  } else {
    // The demo seed and its shared password exist only on a trial server
    if (env.DEMO_SEED === 'true') errors.push('DEMO_SEED is allowed only with APP_ENV=trial');
    if (production && env.TRIAL_DEMO_PASSWORD) errors.push('TRIAL_DEMO_PASSWORD is allowed only with APP_ENV=trial');
    // A demo payment marks orders paid with no money: never anywhere but a trial (Sprint 26)
    if (env.DEMO_PAYMENTS != null && env.DEMO_PAYMENTS !== '') errors.push('DEMO_PAYMENTS is allowed only with APP_ENV=trial');
  }

  if (production) {
    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const r = secret(name).safeParse(env[name]);
      if (!r.success) errors.push(r.error.issues[0].message);
    }
    if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) errors.push('JWT access and refresh secrets must differ');
    if (!env.DB_PASSWORD || PLACEHOLDER.test(env.DB_PASSWORD)) errors.push('DB_PASSWORD must be set to a real password');
    if (!env.CORS_ORIGINS) errors.push('CORS_ORIGINS must list the website origin(s)');
    if (env.COOKIE_SECURE === 'false') errors.push('COOKIE_SECURE=false is not allowed in production');
    // Unset behind a load balancer, every visitor shares one address and rate limits become global
    if (env.TRUST_PROXY_HOPS == null || !/^\d+$/.test(String(env.TRUST_PROXY_HOPS))) errors.push('TRUST_PROXY_HOPS must be set (1 behind an AWS load balancer, 0 if none)');
    if (env.DISABLE_SCHEDULER === 'true') warnings.push('Scheduler disabled: licence, refill, settlement and reminder jobs will not run');
    if (env.AWS_REGION && env.AWS_REGION !== 'ap-south-1') errors.push('AWS_REGION must be ap-south-1 (data stays in India, C-44)');
  }
  if (!env.FCM_SERVICE_ACCOUNT_JSON) warnings.push('Push notifications off: FCM_SERVICE_ACCOUNT_JSON not set');
  const irp = ['IRP_BASE_URL', 'IRP_CLIENT_ID', 'IRP_CLIENT_SECRET', 'IRP_USERNAME', 'IRP_PASSWORD', 'IRP_PUBLIC_KEY'];
  if (irp.some((k) => env[k]) && irp.some((k) => !env[k])) warnings.push(`E-invoicing incomplete: set all of ${irp.join(', ')}`);
  if (env.AGORA_APP_ID && !env.AGORA_APP_CERTIFICATE) (production ? errors : warnings).push('AGORA_APP_CERTIFICATE must be set: calls need signed tokens');
  if (env.SHIPROCKET_EMAIL && !env.SHIPROCKET_WEBHOOK_TOKEN) warnings.push('Shiprocket tracking updates refused: SHIPROCKET_WEBHOOK_TOKEN not set');
  if (production) {
    const overridden = ['MSG91_BASE_URL', 'GOOGLE_OAUTH_TOKEN_URL', 'FCM_BASE_URL', 'SHIPROCKET_BASE_URL', 'RAZORPAY_BASE_URL'].filter((k) => env[k]);
    if (overridden.length) errors.push(`${overridden.join(', ')} must not be set in production (test-only provider addresses)`);
    // Prescriptions and KYC files go only to S3 in ap-south-1 (C-41, C-44). Another
    // S3-compatible store is for a closed staging stack only; the in-memory test fake
    // (backend/test/fakes/s3.mjs, scripts/record-journeys.sh) never.
    if (env.S3_ENDPOINT) {
      const msg = 'S3_ENDPOINT must not be set in production (documents go only to AWS S3 in ap-south-1)';
      (env.ALLOW_MISSING_INTEGRATIONS === 'true' && !realProduction ? warnings : errors).push(msg);
    }
    // Signed links for the browser name the store's public address (trial: Caddy at
    // FILES_DOMAIN); only meaningful next to S3_ENDPOINT, and only over HTTPS (C-41)
    if (env.S3_PUBLIC_ENDPOINT) {
      if (!env.S3_ENDPOINT) errors.push('S3_PUBLIC_ENDPOINT is only for an S3-compatible store (S3_ENDPOINT); unset it for AWS S3');
      else if (!/^https:\/\/[^/\s]+\/?$/.test(env.S3_PUBLIC_ENDPOINT)) errors.push('S3_PUBLIC_ENDPOINT must be an https:// origin (e.g. https://files.example.in)');
    }
    if (/fake/i.test(String(env.AWS_S3_BUCKET ?? '')) || /^fake$/i.test(String(env.AWS_ACCESS_KEY_ID ?? ''))) {
      errors.push('AWS_S3_BUCKET / AWS_ACCESS_KEY_ID are the test fakes; set the real bucket and keys');
    }
  }
  const missing = INTEGRATIONS.filter((k) => !env[k] || PLACEHOLDER.test(String(env[k])));
  if (missing.length) {
    const msg = `Not configured: ${missing.join(', ')}`;
    if (production && env.ALLOW_MISSING_INTEGRATIONS !== 'true') errors.push(msg);
    else warnings.push(msg);
  }
  return { errors, warnings };
}
