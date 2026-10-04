import { computeItems, manualEvidence, statusLabel, summarise } from './computed';
import { secretFacts } from './facts.service';
import { ReadinessFacts } from './types';

const NOW = '2026-10-04T06:00:00.000Z';
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3600_000).toISOString();

function facts(over: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return {
    now: NOW, app_env: 'production',
    secrets: { razorpay_key_id: true, razorpay_key_secret: true, razorpay_webhook_secret: true, razorpay_mode: 'live', msg91_auth_key: true,
      health_enc_key: true, totp_enc_key: true, shiprocket: true, fcm: true, agora: true, provider_overrides: [] },
    public_web_url: 'https://www.example.test',
    sms: { otp_template: true, mapped: ['otp', 'dispatched', 'out_for_delivery', 'delivered', 'order_cancelled', 'return_update'],
      required: ['otp', 'dispatched', 'out_for_delivery', 'delivered', 'order_cancelled', 'return_update'] },
    webhooks: { last_received_at: hoursAgo(2), last_30_days: 12 },
    two_factor: { policy: 'required', logins: 4, enrolled: 4 },
    pharmacists: { dawabag: 2, dawabag_recorded: 2, dawabag_verified: 2, partner: 1, partner_verified: 1 },
    cold_chain_couriers: 2,
    policies: ['terms', 'privacy', 'shipping', 'cancellation', 'refund'].map((key) => ({ key, published: true, lawyer_reviewed: true })),
    practitioners: { total: 3, verified: 3, pending: 0, lapsed: 0, refused: 0 },
    products: { live: 10, live_copy_pending: 0, drafts_open: 0, drafts_with_suggestions: 0, live_with_info: 10, live_without_info: 0,
      imported_info_open: 0, buyer_restricted: 1, online_restricted_live: 0, online_restricted_all: 0, online_permitted_live: 10, schedule_c_c1: 2 },
    emergency_stop: { paused: false, since: null, reference: null },
    backup: { last_ok_at: hoursAgo(5), last_failed_at: null },
    chain: { last_checked_at: hoursAgo(6), chains: 3, broken: 0, last_job_status: 'succeeded' },
    db_login: { user: 'dawabag_api', restricted: true },
    demo: { logins: 0, products: 0 },
    stock_feeds: { live_partners: 1, newest_snapshot_at: hoursAgo(0.1) },
    riders: 0,
    ...over,
  };
}
const status = (f: ReadinessFacts, key: string) => computeItems(f).find((i) => i.key === key)!.status;

describe('launch readiness — computed items', () => {
  it('a fully set-up production server is ready on every computed item', () => {
    const items = computeItems(facts());
    expect(items.filter((i) => i.status !== 'done').map((i) => i.key)).toEqual([]);
    expect(summarise(items)).toEqual({ ready: items.length, total: items.length, in_progress: 0, not_started: 0, not_applicable: 0 });
  });

  it('production-only items are not applicable on the trial, and say so', () => {
    const f = facts({ app_env: 'trial', secrets: { ...facts().secrets, razorpay_mode: 'test' }, backup: { last_ok_at: null, last_failed_at: null } });
    for (const k of ['razorpay_keys', 'app_env', 'backups']) expect(status(f, k)).toBe('not_applicable');
    const rz = computeItems(f).find((i) => i.key === 'razorpay_keys')!;
    expect(rz.status_label).toBe('Not applicable on trial');
    expect(rz.evidence.join(' ')).toContain('test mode');
    expect(statusLabel('not_applicable', 'computed', 'development')).toBe('Not applicable on this server');
    expect(statusLabel('not_applicable', 'manual', 'trial')).toBe('Not needed');
    expect(summarise(computeItems(f)).not_applicable).toBe(3);
  });

  it('Razorpay: test keys on production are in progress; no keys not started', () => {
    expect(status(facts({ secrets: { ...facts().secrets, razorpay_mode: 'test' } }), 'razorpay_keys')).toBe('in_progress');
    expect(status(facts({ secrets: { ...facts().secrets, razorpay_key_id: false, razorpay_key_secret: false, razorpay_mode: null } }), 'razorpay_keys')).toBe('not_started');
    expect(status(facts({ webhooks: { last_received_at: null, last_30_days: 0 } }), 'razorpay_webhook')).toBe('in_progress');
  });

  it('SMS needs the key and every required template', () => {
    const f = facts({ sms: { ...facts().sms, mapped: ['otp', 'dispatched'] } });
    expect(status(f, 'sms_provider')).toBe('in_progress');
    expect(computeItems(f).find((i) => i.key === 'sms_provider')!.evidence.join(' ')).toContain('2 of 6');
    expect(status(facts({ secrets: { ...facts().secrets, msg91_auth_key: false }, sms: { ...facts().sms, mapped: [], otp_template: false } }), 'sms_provider')).toBe('not_started');
  });

  it('two-step sign-in: optional with some enrolled is in progress, required with all enrolled is done', () => {
    expect(status(facts({ two_factor: { policy: 'optional', logins: 4, enrolled: 4 } }), 'two_factor')).toBe('in_progress');
    expect(status(facts({ two_factor: { policy: 'optional', logins: 4, enrolled: 0 } }), 'two_factor')).toBe('not_started');
    const ev = computeItems(facts({ two_factor: { policy: 'optional', logins: 4, enrolled: 1 } })).find((i) => i.key === 'two_factor')!.evidence;
    expect(ev).toContain('Staff and partner logins using it: 1 of 4 (25%)');
  });

  it('pharmacists, doctors, policies, catalogue', () => {
    expect(status(facts({ pharmacists: { dawabag: 2, dawabag_recorded: 1, dawabag_verified: 1, partner: 1, partner_verified: 0 } }), 'pharmacist_registrations')).toBe('in_progress');
    expect(status(facts({ pharmacists: { dawabag: 0, dawabag_recorded: 0, dawabag_verified: 0, partner: 0, partner_verified: 0 } }), 'pharmacist_registrations')).toBe('not_started');
    expect(status(facts({ practitioners: { total: 0, verified: 0, pending: 0, lapsed: 0, refused: 0 } }), 'practitioner_registrations')).toBe('done');
    expect(status(facts({ practitioners: { total: 2, verified: 1, pending: 1, lapsed: 0, refused: 0 } }), 'practitioner_registrations')).toBe('in_progress');
    const pol = facts({ policies: facts().policies.map((p, i) => ({ ...p, published: i < 2 })) });
    expect(status(pol, 'policies')).toBe('in_progress');
    expect(computeItems(pol).find((i) => i.key === 'policies')!.evidence[0]).toBe('Published: 2 of 5 (not published: shipping, cancellation, refund)');
    expect(status(facts({ policies: facts().policies.map((p) => ({ ...p, lawyer_reviewed: false })) }), 'policies')).toBe('in_progress');
    expect(status(facts({ products: { ...facts().products, drafts_open: 3 } }), 'catalogue')).toBe('in_progress');
    expect(status(facts({ products: { ...facts().products, online_restricted_live: 2 } }), 'online_sale')).toBe('in_progress');
    expect(status(facts({ products: { ...facts().products, imported_info_open: 1 } }), 'medicine_info')).toBe('in_progress');
    expect(status(facts({ cold_chain_couriers: 0 }), 'cold_chain_couriers')).toBe('not_started');
  });

  it('backups, chain check, emergency stop, database login, keys', () => {
    expect(status(facts({ backup: { last_ok_at: hoursAgo(30), last_failed_at: null } }), 'backups')).toBe('in_progress');
    expect(status(facts({ backup: { last_ok_at: null, last_failed_at: null } }), 'backups')).toBe('not_started');
    const failed = computeItems(facts({ backup: { last_ok_at: hoursAgo(30), last_failed_at: hoursAgo(4) } })).find((i) => i.key === 'backups')!;
    expect(failed.evidence.join(' ')).toContain('FAILED');
    expect(status(facts({ chain: { last_checked_at: hoursAgo(6), chains: 3, broken: 1, last_job_status: 'succeeded' } }), 'chain_check')).toBe('in_progress');
    expect(status(facts({ chain: { last_checked_at: null, chains: 0, broken: 0, last_job_status: null } }), 'chain_check')).toBe('not_started');
    expect(status(facts({ emergency_stop: { paused: true, since: hoursAgo(1), reference: 'GSR DEMO' } }), 'emergency_stop')).toBe('in_progress');
    expect(status(facts({ db_login: { user: 'owner', restricted: false } }), 'db_login')).toBe('not_started');
    expect(status(facts({ secrets: { ...facts().secrets, totp_enc_key: false } }), 'encryption_keys')).toBe('in_progress');
    expect(status(facts({ public_web_url: 'http://localhost:3000' }), 'public_web_url')).toBe('in_progress');
    expect(status(facts({ demo: { logins: 8, products: 0 } }), 'app_env')).toBe('in_progress');
    expect(status(facts({ secrets: { ...facts().secrets, provider_overrides: ['SHIPROCKET_BASE_URL'] } }), 'integrations')).toBe('in_progress');
  });

  it('manual items carry counts the software can see', () => {
    expect(manualEvidence('5.3', facts())).toEqual(['Products marked Schedule C / C1: 2']);
    expect(manualEvidence('1.6', facts())).toEqual(['Products with a buyer restriction set: 1']);
    expect(manualEvidence('1.2', facts())).toEqual([]);
  });
});

describe('launch readiness — secrets', () => {
  it('reads only whether a secret is set, and the Razorpay mode from the key prefix', () => {
    const env = { RAZORPAY_KEY_ID: 'rzp_live_SECRETVALUE1', RAZORPAY_KEY_SECRET: 'very-secret-value', HEALTH_ENC_KEY: 'k'.repeat(64), TOTP_ENC_KEY: ' ' } as NodeJS.ProcessEnv;
    const s = secretFacts(env);
    expect(s.razorpay_mode).toBe('live');
    expect(s.totp_enc_key).toBe(false);     // blank is not set
    const text = JSON.stringify(computeItems(facts({ secrets: s })));
    for (const v of Object.values(env)) if (String(v).trim().length > 4) expect(text).not.toContain(String(v));
  });
});
