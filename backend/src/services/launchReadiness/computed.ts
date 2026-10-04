// Launch readiness, computed items (Sprint 49). PURE: facts in (facts.service.ts reads them),
// items out — unit-tested in computed.test.ts. One item per row of docs/LAUNCH_CHECKLIST.md
// that the software can see. Evidence is counts, settings and dates in plain words; a
// secret appears only as "set" / "not set" (C-41, C-44). Items that only matter on the
// production server (live payment keys, APP_ENV=production, nightly backups) are
// "not applicable" on the trial and development servers.
import { formatDateTimeIST } from '../../utils/ist';
import { ReadinessFacts, ReadinessItem, ReadinessLink, ReadinessStatus } from './types';

const HOUR = 3600_000;
export const BACKUP_MAX_AGE_HOURS = 26;          // as deploy/staging/check.sh
export const CHAIN_CHECK_MAX_AGE_HOURS = 48;      // nightly job, one missed night tolerated
export const WEBHOOK_RECENT_DAYS = 30;

const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);
const when = (iso: string | null) => (iso ? formatDateTimeIST(iso) : 'never');
const ageHours = (facts: ReadinessFacts, iso: string | null) => (iso ? (Date.parse(facts.now) - Date.parse(iso)) / HOUR : Infinity);
const set = (b: boolean) => (b ? 'set' : 'not set');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const isProduction = (f: ReadinessFacts) => f.app_env === 'production';

export function statusLabel(status: ReadinessStatus, kind: 'computed' | 'manual', appEnv: string): string {
  switch (status) {
    case 'done': return 'Done';
    case 'in_progress': return 'In progress';
    case 'not_started': return 'Not started';
    default:
      if (kind === 'manual') return 'Not needed';
      return appEnv === 'trial' ? 'Not applicable on trial' : 'Not applicable on this server';
  }
}

interface Def {
  key: string; ref: string; section: number; title: string; who: string; link: ReadinessLink | null;
  evaluate: (f: ReadinessFacts) => { status: ReadinessStatus; evidence: string[] };
}

const link = (href: string, label: string): ReadinessLink => ({ href, label });
const notHere = (f: ReadinessFacts) => `This server is APP_ENV=${f.app_env}; this is checked on the production server.`;

const DEFS: Def[] = [
  // ── 2. Payments (C-35) ────────────────────────────────────────────────────
  {
    key: 'razorpay_keys', ref: '2.1', section: 2, who: 'Owner, Developer', link: null,
    title: 'Razorpay live keys in the server\'s secret store (RUNBOOK §2, §8 item 5)',
    evaluate: (f) => {
      const s = f.secrets;
      const keys = s.razorpay_key_id && s.razorpay_key_secret;
      const mode = !keys ? 'no keys' : s.razorpay_mode === 'live' ? 'live mode' : s.razorpay_mode === 'test' ? 'test mode' : 'mode not recognised';
      const evidence = [`Key id ${set(s.razorpay_key_id)}, key secret ${set(s.razorpay_key_secret)} — ${mode}`];
      if (!isProduction(f)) return { status: 'not_applicable', evidence: [...evidence, notHere(f)] };
      if (keys && s.razorpay_mode === 'live') return { status: 'done', evidence };
      return { status: keys ? 'in_progress' : 'not_started', evidence };
    },
  },
  {
    key: 'razorpay_webhook', ref: '2.1', section: 2, who: 'Owner, Developer', link: null,
    title: 'Razorpay webhook set up (including payment.authorized) and events arriving',
    evaluate: (f) => {
      const evidence = [`Webhook secret ${set(f.secrets.razorpay_webhook_secret)}`,
        `Last webhook event received: ${when(f.webhooks.last_received_at)}; ${plural(f.webhooks.last_30_days, 'event')} in the last ${WEBHOOK_RECENT_DAYS} days`];
      if (f.secrets.razorpay_webhook_secret && f.webhooks.last_30_days > 0) return { status: 'done', evidence };
      if (f.secrets.razorpay_webhook_secret || f.webhooks.last_30_days > 0) return { status: 'in_progress', evidence };
      return { status: 'not_started', evidence };
    },
  },
  // ── 3. SMS (TRAI DLT; C-41 sign-in codes) ─────────────────────────────────
  {
    key: 'sms_provider', ref: '3.1', section: 3, who: 'Owner', link: link('/admin/settings', 'Admin → Settings (SMS templates)'),
    title: 'MSG91 account key set and the DLT templates mapped (sign-in code, dispatched, out for delivery, delivered, order cancelled, return update)',
    evaluate: (f) => {
      const missing = f.sms.required.filter((t) => !f.sms.mapped.includes(t));
      const evidence = [`MSG91 key ${set(f.secrets.msg91_auth_key)}`, `Sign-in code template ${f.sms.otp_template ? 'registered' : 'missing'}`,
        `Templates mapped: ${f.sms.required.length - missing.length} of ${f.sms.required.length}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`];
      if (f.secrets.msg91_auth_key && !missing.length) return { status: 'done', evidence };
      if (f.secrets.msg91_auth_key || f.sms.mapped.length) return { status: 'in_progress', evidence };
      return { status: 'not_started', evidence };
    },
  },
  // ── 4. Server and secrets ─────────────────────────────────────────────────
  {
    key: 'backups', ref: '4.1', section: 4, who: 'Developer, Owner', link: null,
    title: `Nightly database backups to the object store (newest under ${BACKUP_MAX_AGE_HOURS} hours old) (RUNBOOK §6, §7c)`,
    evaluate: (f) => {
      const age = ageHours(f, f.backup.last_ok_at);
      const evidence = [`Last successful backup: ${when(f.backup.last_ok_at)}${Number.isFinite(age) ? ` (${Math.round(age)} h ago)` : ''}`];
      if (f.backup.last_failed_at && (!f.backup.last_ok_at || f.backup.last_failed_at > f.backup.last_ok_at)) {
        evidence.push(`Last attempt FAILED: ${when(f.backup.last_failed_at)} — see the backup service's log`);
      }
      if (!f.backup.last_ok_at && !f.backup.last_failed_at && !isProduction(f)) return { status: 'not_applicable', evidence: [...evidence, notHere(f)] };
      if (age <= BACKUP_MAX_AGE_HOURS) return { status: 'done', evidence };
      return { status: f.backup.last_ok_at || f.backup.last_failed_at ? 'in_progress' : 'not_started', evidence };
    },
  },
  {
    key: 'chain_check', ref: '4.1', section: 4, who: 'Developer', link: link('/admin/integrity', 'Admin → Record integrity'),
    title: 'Record-integrity check (audit log and Schedule H1 register chains) runs nightly and finds no break (C-09, C-46)',
    evaluate: (f) => {
      const c = f.chain;
      const evidence = [`Last check: ${when(c.last_checked_at)}`, c.chains ? `${plural(c.chains, 'chain')} checked, ${c.broken} broken` : 'No chain checked yet'];
      if (c.last_job_status) evidence.push(`Last nightly job: ${c.last_job_status}`);
      if (!c.last_checked_at) return { status: 'not_started', evidence };
      if (c.broken > 0) return { status: 'in_progress', evidence: [...evidence, 'A broken chain must be investigated before launch (RUNBOOK §6 "chain break")'] };
      return { status: ageHours(f, c.last_checked_at) <= CHAIN_CHECK_MAX_AGE_HOURS ? 'done' : 'in_progress', evidence };
    },
  },
  {
    key: 'app_env', ref: '4.2', section: 4, who: 'Developer', link: null,
    title: 'APP_ENV=production, no demo data or demo logins (RUNBOOK §2, §8 item 0)',
    evaluate: (f) => {
      const evidence = [`APP_ENV=${f.app_env}`, `Demo logins: ${f.demo.logins}; demo products: ${f.demo.products}`];
      if (!isProduction(f)) return { status: 'not_applicable', evidence };
      return { status: f.demo.logins + f.demo.products === 0 ? 'done' : 'in_progress', evidence };
    },
  },
  {
    key: 'encryption_keys', ref: '4.3', section: 4, who: 'Developer, Owner', link: null,
    title: 'HEALTH_ENC_KEY (health details) and TOTP_ENC_KEY (two-step sign-in) set from the secret store (RUNBOOK §6)',
    evaluate: (f) => {
      const n = Number(f.secrets.health_enc_key) + Number(f.secrets.totp_enc_key);
      const evidence = [`HEALTH_ENC_KEY ${set(f.secrets.health_enc_key)}`, `TOTP_ENC_KEY ${set(f.secrets.totp_enc_key)}`,
        'Only whether each key is set is shown here — keep a safe copy outside the server: losing a key makes that data unreadable'];
      return { status: n === 2 ? 'done' : n === 1 ? 'in_progress' : 'not_started', evidence };
    },
  },
  {
    key: 'db_login', ref: '4.4', section: 4, who: 'Developer', link: null,
    title: 'The API connects as its own restricted database login (DB_APP_PASSWORD) (RUNBOOK §6)',
    evaluate: (f) => {
      if (f.db_login.restricted === null) return { status: 'not_started', evidence: ['The database login could not be checked'] };
      const evidence = [`Connected as "${f.db_login.user}" — ${f.db_login.restricted ? 'restricted (member of dawabag_app only)' : 'NOT restricted'}`];
      return { status: f.db_login.restricted ? 'done' : 'not_started', evidence };
    },
  },
  {
    key: 'public_web_url', ref: '4.5', section: 4, who: 'Developer', link: null,
    title: 'PUBLIC_WEB_URL = the public website address, so e-prescription QR codes and links open the right site (RUNBOOK §2)',
    evaluate: (f) => {
      const u = f.public_web_url;
      if (!u) return { status: 'not_started', evidence: ['PUBLIC_WEB_URL not set'] };
      const ok = /^https:\/\//i.test(u) && !/localhost|127\.0\.0\.1/i.test(u);
      return { status: ok ? 'done' : 'in_progress', evidence: [`PUBLIC_WEB_URL = ${u}${ok ? '' : ' (not a public https address)'}`] };
    },
  },
  {
    key: 'integrations', ref: '4.6', section: 4, who: 'Owner, Developer', link: null,
    title: 'Shiprocket (couriers), Firebase (app notifications) and Agora (video calls) configured (RUNBOOK §2)',
    evaluate: (f) => {
      const s = f.secrets;
      const n = Number(s.shiprocket) + Number(s.fcm) + Number(s.agora);
      const evidence = [`Shiprocket ${set(s.shiprocket)}, Firebase ${set(s.fcm)}, Agora ${set(s.agora)}`];
      if (s.provider_overrides.length) evidence.push(`Pointed at a test stand-in: ${s.provider_overrides.join(', ')}`);
      if (n === 3 && !s.provider_overrides.length) return { status: 'done', evidence };
      return { status: n > 0 ? 'in_progress' : 'not_started', evidence };
    },
  },
  {
    key: 'emergency_stop', ref: '4.9', section: 4, who: 'Super-admin', link: link('/admin/emergency-stop', 'Admin → Emergency stop'),
    title: 'Emergency stop off: prescription-medicine sales are open (C-08)',
    evaluate: (f) => (f.emergency_stop.paused
      ? { status: 'in_progress', evidence: [`PAUSED since ${when(f.emergency_stop.since)}${f.emergency_stop.reference ? ` (reference ${f.emergency_stop.reference})` : ''}`] }
      : { status: 'done', evidence: ['Prescription-medicine sales are open'] }),
  },
  // ── 5. Data and catalogue ─────────────────────────────────────────────────
  {
    key: 'catalogue', ref: '5.1', section: 5, who: 'Owner, pharmacist', link: link('/staff/new-products', 'New products to complete'),
    title: 'Catalogue imported; drafts completed by a pharmacist and product text approved (C-17, C-19) (RUNBOOK §8 item 3)',
    evaluate: (f) => {
      const p = f.products;
      const evidence = [`Live products: ${p.live}`, `Drafts waiting for a pharmacist: ${p.drafts_open} (with catalogue suggestions: ${p.drafts_with_suggestions})`,
        `Live products whose text is not approved yet: ${p.live_copy_pending}`];
      if (!p.live) return { status: p.drafts_open ? 'in_progress' : 'not_started', evidence };
      return { status: p.drafts_open === 0 && p.live_copy_pending === 0 ? 'done' : 'in_progress', evidence };
    },
  },
  {
    key: 'online_sale', ref: '5.2', section: 5, who: 'Pharmacist', link: link('/staff/online-sale', 'Online-sale status'),
    title: 'Each live medicine allowed for online sale by a pharmacist (new products start "not allowed online yet") (RUNBOOK §8 item 4)',
    evaluate: (f) => {
      const p = f.products;
      const evidence = [`Live products allowed online: ${p.online_permitted_live}`, `Live products not allowed online yet: ${p.online_restricted_live}`,
        `All products "not allowed online yet" (including drafts): ${p.online_restricted_all}`];
      if (!p.live) return { status: 'not_started', evidence };
      if (!p.online_restricted_live) return { status: 'done', evidence };
      return { status: p.online_permitted_live ? 'in_progress' : 'not_started', evidence };
    },
  },
  {
    key: 'medicine_info', ref: '5.4', section: 5, who: 'Pharmacists', link: link('/staff/medicine-info-imported', 'Imported drafts to check'),
    title: 'Imported medicine information and catalogue suggestions checked and approved by pharmacists (RUNBOOK §7i, §7j)',
    evaluate: (f) => {
      const p = f.products;
      const evidence = [`Live products with approved medicine information: ${p.live_with_info}; without: ${p.live_without_info}`,
        `Imported information drafts not approved yet: ${p.imported_info_open}`, `Draft products with a suggestion to check: ${p.drafts_with_suggestions}`];
      if (!p.live) return { status: 'not_started', evidence };
      if (!p.imported_info_open && !p.drafts_with_suggestions) return { status: 'done', evidence };
      return { status: 'in_progress', evidence };
    },
  },
  {
    key: 'cold_chain_couriers', ref: '5.5', section: 5, who: 'Owner', link: link('/admin/settings', 'Admin → Settings (Approved cold-chain couriers)'),
    title: 'Approved cold-chain courier list entered — until then fridge items can go with any courier (C-25) (RUNBOOK §8 item 12)',
    evaluate: (f) => (f.cold_chain_couriers > 0
      ? { status: 'done', evidence: [`${plural(f.cold_chain_couriers, 'approved courier')} listed`] }
      : { status: 'not_started', evidence: ['No approved cold-chain courier listed'] }),
  },
  // ── 6. Staff set-up ───────────────────────────────────────────────────────
  {
    key: 'pharmacist_registrations', ref: '6.1', section: 6, who: 'Owner, Admin', link: link('/admin/pharmacist-registrations', 'Admin → Pharmacist registrations'),
    title: 'Every pharmacist\'s council, registration number and valid-till recorded and verified — Dawabag\'s and the partners\' (C-19) (RUNBOOK §8 item 4)',
    evaluate: (f) => {
      const p = f.pharmacists;
      const total = p.dawabag + p.partner, verified = p.dawabag_verified + p.partner_verified;
      const evidence = [`Dawabag pharmacists: ${p.dawabag} (recorded ${p.dawabag_recorded}, verified and in date ${p.dawabag_verified})`,
        `Partners' pharmacists: ${p.partner} (verified and in date ${p.partner_verified})`];
      if (!total) return { status: 'not_started', evidence: [...evidence, 'No pharmacist set up yet'] };
      if (verified === total) return { status: 'done', evidence };
      return { status: verified || p.dawabag_recorded ? 'in_progress' : 'not_started', evidence };
    },
  },
  {
    key: 'two_factor', ref: '6.2', section: 6, who: 'Owner, staff', link: link('/admin/two-factor', 'Admin → Two-step sign-in (all)'),
    title: 'Every staff and partner login uses two-step sign-in, then Settings → "Two-step sign-in" is set to required (C-41) (RUNBOOK §2)',
    evaluate: (f) => {
      const t = f.two_factor;
      const evidence = [`Policy: ${t.policy}`, `Staff and partner logins using it: ${t.enrolled} of ${t.logins} (${pct(t.enrolled, t.logins)}%)`];
      if (t.policy === 'required' && t.enrolled >= t.logins) return { status: 'done', evidence };
      return { status: t.enrolled > 0 || t.policy === 'required' ? 'in_progress' : 'not_started', evidence };
    },
  },
  {
    key: 'practitioner_registrations', ref: '6.3', section: 6, who: 'Admin', link: link('/admin/practitioners', 'Admin → Doctor registrations'),
    title: 'Doctor / hospital accounts: each registration verified with valid-till and the certificate copy (r.65(9)(b)) (RUNBOOK §7h)',
    evaluate: (f) => {
      const p = f.practitioners;
      const evidence = [`Doctor / hospital accounts: ${p.total} — verified and in date ${p.verified}, waiting ${p.pending}, lapsed ${p.lapsed}, refused or suspended ${p.refused}`];
      if (!p.total) return { status: 'done', evidence: ['No doctor or hospital accounts yet — nothing waiting'] };
      return { status: p.pending + p.lapsed === 0 ? 'done' : 'in_progress', evidence };
    },
  },
  // ── 7. Policies (C-37, C-39) ──────────────────────────────────────────────
  {
    key: 'policies', ref: '7.1', section: 7, who: 'Lawyer, Owner', link: link('/admin/policies', 'Admin → Policies'),
    title: 'The five policies — Terms, Privacy, Shipping, Cancellation and Refund — reviewed by the lawyer and published (RUNBOOK §8 item 2)',
    evaluate: (f) => {
      const published = f.policies.filter((p) => p.published);
      const unpublished = f.policies.filter((p) => !p.published).map((p) => p.key);
      const notReviewed = published.filter((p) => !p.lawyer_reviewed).map((p) => p.key);
      const evidence = [`Published: ${published.length} of ${f.policies.length}${unpublished.length ? ` (not published: ${unpublished.join(', ')})` : ''}`];
      if (notReviewed.length) evidence.push(`Published without the lawyer's review: ${notReviewed.join(', ')}`);
      if (!unpublished.length && !notReviewed.length) return { status: 'done', evidence };
      return { status: published.length ? 'in_progress' : 'not_started', evidence };
    },
  },
];

export const COMPUTED_KEYS = DEFS.map((d) => d.key);

export function computeItems(facts: ReadinessFacts): ReadinessItem[] {
  return DEFS.map((d) => {
    const { status, evidence } = d.evaluate(facts);
    return { key: d.key, ref: d.ref, section: d.section, kind: 'computed', title: d.title, who: d.who, status,
      status_label: statusLabel(status, 'computed', facts.app_env), evidence, link: d.link };
  });
}

/** Counts the software can show next to a manual item, which a person still decides. */
export function manualEvidence(key: string, f: ReadinessFacts): string[] {
  switch (key) {
    case '1.6': return [`Products with a buyer restriction set: ${f.products.buyer_restricted}`];
    case '5.3': return [`Products marked Schedule C / C1: ${f.products.schedule_c_c1}`];
    case '4.8': return [`Partners on the live stock feed: ${f.stock_feeds.live_partners}`,
      `Newest live snapshot received: ${when(f.stock_feeds.newest_snapshot_at)}`];
    case '6.4': return [`Active rider logins: ${f.riders}`];
    default: return [];
  }
}

export interface ReadinessSummary { ready: number; total: number; in_progress: number; not_started: number; not_applicable: number }

/** "X of Y ready": items not applicable here are left out of Y. */
export function summarise(items: Pick<ReadinessItem, 'status'>[]): ReadinessSummary {
  const n = (s: ReadinessStatus) => items.filter((i) => i.status === s).length;
  const notApplicable = n('not_applicable');
  return { ready: n('done'), total: items.length - notApplicable, in_progress: n('in_progress'), not_started: n('not_started'), not_applicable: notApplicable };
}
