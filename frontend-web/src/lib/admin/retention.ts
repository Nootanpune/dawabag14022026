// Retention of operational data (DPDP storage limitation; C-44). Setting
// retention.days, read and written on the server; the daily retention_purge
// job deletes rows older than these periods. Statutory records are never purged.

export const RETENTION_KEY = 'retention.days';

export const RETENTION_FIELDS = [
  { key: 'notification_deliveries', label: 'SMS / email / push delivery log', min: 30, optional: false },
  { key: 'notifications', label: 'In-app notifications', min: 30, optional: false },
  { key: 'payment_webhook_events', label: 'Payment gateway webhook events', min: 180, optional: false },
  { key: 'job_runs', label: 'Background job run history', min: 30, optional: false },
  { key: 'abandoned_carts', label: 'Carts not touched', min: 30, optional: false },
  { key: 'stale_devices', label: 'Phones not seen (push registrations)', min: 30, optional: false },
  // Sprint 34: "My medicines" answers and ended reminders; health profiles (C-43, C-44)
  { key: 'reminder_dose_logs', label: 'Medicine reminder answers (Taken / Skipped)', min: 30, optional: false },
  { key: 'ended_reminders', label: 'Medicine reminders that ended or were switched off', min: 30, optional: false },
  {
    key: 'inactive_health_profiles',
    label: 'Health profiles of accounts not used for',
    min: 365,
    optional: true,
    blank: 'Kept until the buyer withdraws consent or asks for erasure',
  },
] as const;

export type RetentionField = (typeof RETENTION_FIELDS)[number]['key'];
export type RetentionDays = Partial<Record<RetentionField, number | null>>;
export const RETENTION_MAX_DAYS = 3650;

/** What a blank field means: optional ones are kept until withdrawn; others are not purged. */
export function blankMeaning(key: RetentionField): string {
  const f = RETENTION_FIELDS.find((x) => x.key === key);
  return f && 'blank' in f ? f.blank : 'kept';
}

/** Server value → editable strings (missing fields stay blank) */
export function toRetentionDraft(value: unknown): Record<RetentionField, string> {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<RetentionField, unknown>>;
  return Object.fromEntries(
    RETENTION_FIELDS.map((f) => [f.key, typeof v[f.key] === 'number' ? String(v[f.key]) : ''])
  ) as Record<RetentionField, string>;
}

/** Strings → the object to PUT, or the first error. The server checks the same limits. */
export function fromRetentionDraft(draft: Record<RetentionField, string>): { value: RetentionDays } | { error: string } {
  const out: RetentionDays = {};
  for (const f of RETENTION_FIELDS) {
    const raw = draft[f.key].trim();
    if (raw === '' && f.optional) { out[f.key] = null; continue; }
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n)) return { error: `${f.label}: enter a whole number of days` };
    if (n < f.min || n > RETENTION_MAX_DAYS) return { error: `${f.label}: between ${f.min} and ${RETENTION_MAX_DAYS} days` };
    out[f.key] = n;
  }
  return { value: out };
}
