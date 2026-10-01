// src/config/env.ts — configuration is checked once at start-up, so a missing or
// weak setting stops the server instead of failing on a customer's request.
// Production refuses placeholder secrets and missing payment/SMS/storage keys
// (set ALLOW_MISSING_INTEGRATIONS=true only for a closed staging environment).
import { z } from 'zod';

const PLACEHOLDER = /change_this|your_|example|placeholder/i;
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

  if (production) {
    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const r = secret(name).safeParse(env[name]);
      if (!r.success) errors.push(r.error.issues[0].message);
    }
    if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) errors.push('JWT access and refresh secrets must differ');
    if (!env.DB_PASSWORD || PLACEHOLDER.test(env.DB_PASSWORD)) errors.push('DB_PASSWORD must be set to a real password');
    if (!env.CORS_ORIGINS) errors.push('CORS_ORIGINS must list the website origin(s)');
    if (env.COOKIE_SECURE === 'false') errors.push('COOKIE_SECURE=false is not allowed in production');
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
  }
  const missing = INTEGRATIONS.filter((k) => !env[k] || PLACEHOLDER.test(String(env[k])));
  if (missing.length) {
    const msg = `Not configured: ${missing.join(', ')}`;
    if (production && env.ALLOW_MISSING_INTEGRATIONS !== 'true') errors.push(msg);
    else warnings.push(msg);
  }
  return { errors, warnings };
}
