// Launch readiness facts (Sprint 49): counts, flags and dates read on every request from
// the database (the single source of truth) and the API's environment. For a secret only
// its PRESENCE is read — `!!process.env.X` — and the Razorpay mode from the key id's
// prefix; no value leaves this file (C-41, C-44). Nothing is cached.
import { query, getDB } from '../../config/database';
import { loginPosture } from '../../db/appLogin';
import { getSetting } from '../settings.service';
import { otpTemplateMissing, smsConfigured } from '../notifications/channels/sms';
import { approvedCouriers, COLD_CHAIN_COURIERS_KEY } from '../delivery/coldChainCourier';
import { twoFactorPolicy } from '../twoFactor/enrolment.service';
import { TWO_FACTOR_ROLES } from '../twoFactor/policy';
import { getRxPause } from '../emergencyStop/state.service';
import { POLICY_KEYS } from '../policy.service';
import { DEMO_MOBILES } from '../../scripts/demo/people';
import { DEMO_SKU_PREFIX } from '../../scripts/demo/catalogueData';
import { ReadinessFacts } from './types';

/** The SMS a buyer must get before launch (LAUNCH_CHECKLIST 3.1); keys of sms.dlt_templates. */
export const REQUIRED_SMS_TYPES = ['otp', 'dispatched', 'out_for_delivery', 'delivered', 'order_cancelled', 'return_update'] as const;
/** Stand-in addresses used by development / CI (names only are reported). */
const OVERRIDES = ['MSG91_BASE_URL', 'FCM_BASE_URL', 'SHIPROCKET_BASE_URL', 'RAZORPAY_BASE_URL', 'IRP_BASE_URL'];

const has = (env: NodeJS.ProcessEnv, k: string) => !!String(env[k] ?? '').trim();
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => Number(v ?? 0);

export function secretFacts(env: NodeJS.ProcessEnv = process.env): ReadinessFacts['secrets'] {
  const keyId = String(env.RAZORPAY_KEY_ID ?? '');
  return {
    razorpay_key_id: has(env, 'RAZORPAY_KEY_ID'),
    razorpay_key_secret: has(env, 'RAZORPAY_KEY_SECRET'),
    razorpay_webhook_secret: has(env, 'RAZORPAY_WEBHOOK_SECRET'),
    razorpay_mode: !keyId ? null : keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : 'unknown',
    msg91_auth_key: has(env, 'MSG91_AUTH_KEY'),
    health_enc_key: has(env, 'HEALTH_ENC_KEY'),
    totp_enc_key: has(env, 'TOTP_ENC_KEY'),
    shiprocket: has(env, 'SHIPROCKET_EMAIL') && has(env, 'SHIPROCKET_PASSWORD'),
    fcm: has(env, 'FCM_SERVICE_ACCOUNT_JSON'),
    agora: has(env, 'AGORA_APP_ID') && has(env, 'AGORA_APP_CERTIFICATE'),
    provider_overrides: OVERRIDES.filter((k) => has(env, k)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
async function one(sql: string, params: unknown[] = []): Promise<Row> {
  return (await query<Row>(sql, params))[0] ?? {};
}

export async function readinessFacts(env: NodeJS.ProcessEnv = process.env): Promise<ReadinessFacts> {
  const [templates, couriersValue, policy, pause, posture] = await Promise.all([
    getSetting<Record<string, { template_id?: string }>>('sms.dlt_templates', {}),
    getSetting<unknown>(COLD_CHAIN_COURIERS_KEY, null),
    twoFactorPolicy(),
    getRxPause(),
    loginPosture(getDB()).catch(() => null),
  ]);
  const otpTemplate = smsConfigured() ? !(await otpTemplateMissing()) : has(env, 'MSG91_TEMPLATE_OTP') || !!templates?.otp?.template_id;
  const mapped = REQUIRED_SMS_TYPES.filter((t) => (t === 'otp' ? otpTemplate : !!templates?.[t]?.template_id));

  const [webhooks, twoFactor, pharmacists, practitioners, products, backup, chain, chainJob, demo, feeds, riders] = await Promise.all([
    one(`SELECT MAX(received_at) AS last_at, COUNT(*) FILTER (WHERE received_at > NOW() - INTERVAL '30 days')::int AS recent FROM payment_webhook_events`),
    one(`SELECT COUNT(*)::int AS logins, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_two_factor t WHERE t.user_id = u.id AND t.status = 'active'))::int AS enrolled
         FROM users u WHERE u.role = ANY($1) AND u.is_active AND u.deleted_at IS NULL`, [[...TWO_FACTOR_ROLES]]),
    one(`SELECT
           (SELECT COUNT(*) FROM users u WHERE u.role = 'pharmacist_rx' AND u.is_active AND u.deleted_at IS NULL)::int AS dawabag,
           (SELECT COUNT(*) FROM users u JOIN pharmacist_registrations r ON r.user_id = u.id
              WHERE u.role = 'pharmacist_rx' AND u.is_active AND u.deleted_at IS NULL)::int AS dawabag_recorded,
           (SELECT COUNT(*) FROM users u JOIN pharmacist_registrations r ON r.user_id = u.id
              WHERE u.role = 'pharmacist_rx' AND u.is_active AND u.deleted_at IS NULL
                AND r.verified_at IS NOT NULL AND r.status = 'active' AND r.valid_till >= CURRENT_DATE)::int AS dawabag_verified,
           (SELECT COUNT(*) FROM vendor_pharmacists p JOIN vendors v ON v.id = p.vendor_id WHERE p.is_active AND v.is_active)::int AS partner,
           (SELECT COUNT(*) FROM vendor_pharmacists p JOIN vendors v ON v.id = p.vendor_id WHERE p.is_active AND v.is_active
              AND p.verified_at IS NOT NULL AND p.registration_status = 'active' AND p.valid_till >= CURRENT_DATE)::int AS partner_verified`),
    one(`SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE nmc_status = 'verified' AND nmc_valid_till >= CURRENT_DATE)::int AS verified,
           COUNT(*) FILTER (WHERE nmc_status IS NULL OR nmc_status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE nmc_status = 'verified' AND (nmc_valid_till IS NULL OR nmc_valid_till < CURRENT_DATE))::int AS lapsed,
           COUNT(*) FILTER (WHERE nmc_status IN ('rejected', 'suspended'))::int AS refused
         FROM users WHERE customer_type = 'doc_hospital' AND deleted_at IS NULL`),
    one(`WITH live AS (SELECT id, content_status, online_sale_status FROM products WHERE catalogue_state = 'live' AND is_active AND deleted_at IS NULL)
         SELECT (SELECT COUNT(*) FROM live)::int AS live,
           (SELECT COUNT(*) FROM live WHERE content_status <> 'approved')::int AS live_copy_pending,
           (SELECT COUNT(*) FROM catalogue_drafts WHERE status = 'open')::int AS drafts_open,
           (SELECT COUNT(*) FROM catalogue_drafts d WHERE d.status = 'open'
              AND EXISTS (SELECT 1 FROM catalogue_draft_suggestions s WHERE s.product_id = d.product_id))::int AS drafts_with_suggestions,
           (SELECT COUNT(*) FROM live l WHERE EXISTS (SELECT 1 FROM product_info_versions v WHERE v.product_id = l.id AND v.status = 'approved'))::int AS live_with_info,
           (SELECT COUNT(*) FROM product_info_versions WHERE source = 'imported_draft' AND status IN ('draft', 'pending_review'))::int AS imported_info_open,
           (SELECT COUNT(*) FROM products WHERE buyer_restriction <> 'everyone' AND deleted_at IS NULL)::int AS buyer_restricted,
           (SELECT COUNT(*) FROM live WHERE online_sale_status = 'restricted')::int AS online_restricted_live,
           (SELECT COUNT(*) FROM products WHERE online_sale_status = 'restricted' AND deleted_at IS NULL)::int AS online_restricted_all,
           (SELECT COUNT(*) FROM live WHERE online_sale_status = 'permitted')::int AS online_permitted_live,
           (SELECT COUNT(*) FROM products WHERE schedule_c_c1 AND deleted_at IS NULL)::int AS schedule_c_c1`),
    // deploy/staging/backup/backup.sh records each run as job_runs 'db_backup' (Sprint 49)
    one(`SELECT MAX(finished_at) FILTER (WHERE status = 'succeeded') AS ok_at, MAX(started_at) FILTER (WHERE status = 'failed') AS failed_at
         FROM job_runs WHERE job_name = 'db_backup'`),
    one(`SELECT COUNT(*)::int AS chains, COUNT(*) FILTER (WHERE NOT ok)::int AS broken, MAX(recorded_at) AS last_at
         FROM (SELECT DISTINCT ON (chain) chain, ok, recorded_at FROM chain_heads ORDER BY chain, recorded_at DESC) h`),
    one(`SELECT status FROM job_runs WHERE job_name = 'chain_verify' ORDER BY started_at DESC LIMIT 1`),
    one(`SELECT (SELECT COUNT(*) FROM users WHERE mobile = ANY($1) AND deleted_at IS NULL)::int AS logins,
                (SELECT COUNT(*) FROM products WHERE sku LIKE $2 AND deleted_at IS NULL)::int AS products`, [DEMO_MOBILES, `${DEMO_SKU_PREFIX}%`]),
    one(`SELECT COUNT(*) FILTER (WHERE mode = 'live')::int AS live, MAX(last_received_at) FILTER (WHERE mode = 'live') AS newest FROM partner_stock_feeds`),
    one(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'delivery' AND is_active AND deleted_at IS NULL`),
  ]);
  const policies = await query<{ doc_key: string; lawyer_reviewed: boolean }>(
    `SELECT DISTINCT ON (doc_key) doc_key, lawyer_reviewed FROM policy_documents
     WHERE language = 'en' AND effective_from <= CURRENT_DATE ORDER BY doc_key, version DESC`);

  const p = products;
  return {
    now: new Date().toISOString(),
    app_env: String(env.APP_ENV || 'development'),
    secrets: secretFacts(env),
    public_web_url: has(env, 'PUBLIC_WEB_URL') ? String(env.PUBLIC_WEB_URL).trim() : null,
    sms: { otp_template: otpTemplate, mapped, required: [...REQUIRED_SMS_TYPES] },
    webhooks: { last_received_at: iso(webhooks.last_at), last_30_days: num(webhooks.recent) },
    two_factor: { policy, logins: num(twoFactor.logins), enrolled: num(twoFactor.enrolled) },
    pharmacists: {
      dawabag: num(pharmacists.dawabag), dawabag_recorded: num(pharmacists.dawabag_recorded),
      dawabag_verified: num(pharmacists.dawabag_verified), partner: num(pharmacists.partner),
      partner_verified: num(pharmacists.partner_verified),
    },
    cold_chain_couriers: approvedCouriers(couriersValue).length,
    policies: POLICY_KEYS.map((k) => {
      const row = policies.find((r) => r.doc_key === k);
      return { key: k, published: !!row, lawyer_reviewed: !!row?.lawyer_reviewed };
    }),
    practitioners: {
      total: num(practitioners.total), verified: num(practitioners.verified), pending: num(practitioners.pending),
      lapsed: num(practitioners.lapsed), refused: num(practitioners.refused),
    },
    products: {
      live: num(p.live), live_copy_pending: num(p.live_copy_pending), drafts_open: num(p.drafts_open),
      drafts_with_suggestions: num(p.drafts_with_suggestions), live_with_info: num(p.live_with_info),
      live_without_info: num(p.live) - num(p.live_with_info), imported_info_open: num(p.imported_info_open),
      buyer_restricted: num(p.buyer_restricted), online_restricted_live: num(p.online_restricted_live),
      online_restricted_all: num(p.online_restricted_all), online_permitted_live: num(p.online_permitted_live), schedule_c_c1: num(p.schedule_c_c1),
    },
    emergency_stop: { paused: pause.paused, since: pause.paused_at ?? null, reference: pause.reference ?? null },
    backup: { last_ok_at: iso(backup.ok_at), last_failed_at: iso(backup.failed_at) },
    chain: { last_checked_at: iso(chain.last_at), chains: num(chain.chains), broken: num(chain.broken),
      last_job_status: (chainJob.status as string | undefined) ?? null },
    db_login: posture ? { user: posture.user, restricted: posture.restricted } : { user: null, restricted: null },
    demo: { logins: num(demo.logins), products: num(demo.products) },
    stock_feeds: { live_partners: num(feeds.live), newest_snapshot_at: iso(feeds.newest) },
    riders: num(riders.n),
  };
}
