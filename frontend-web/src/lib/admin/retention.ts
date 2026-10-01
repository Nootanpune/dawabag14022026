// Retention of operational data (DPDP storage limitation; C-44). Setting
// retention.days, read and written on the server; the daily retention_purge
// job deletes rows older than these periods. Statutory records are never purged.

export const RETENTION_KEY = 'retention.days';

export const RETENTION_FIELDS = [
  { key: 'notification_deliveries', label: 'SMS / email / push delivery log', min: 30 },
  { key: 'notifications', label: 'In-app notifications', min: 30 },
  { key: 'payment_webhook_events', label: 'Payment gateway webhook events', min: 180 },
  { key: 'job_runs', label: 'Background job run history', min: 30 },
  { key: 'abandoned_carts', label: 'Carts not touched', min: 30 },
  { key: 'stale_devices', label: 'Phones not seen (push registrations)', min: 30 },
] as const;

export type RetentionField = (typeof RETENTION_FIELDS)[number]['key'];
export type RetentionDays = Record<RetentionField, number>;
export const RETENTION_MAX_DAYS = 3650;

/** Server value → editable strings (missing fields stay blank) */
export function toRetentionDraft(value: unknown): Record<RetentionField, string> {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<RetentionField, unknown>>;
  return Object.fromEntries(
    RETENTION_FIELDS.map((f) => [f.key, typeof v[f.key] === 'number' ? String(v[f.key]) : ''])
  ) as Record<RetentionField, string>;
}

/** Strings → the object to PUT, or the first error. The server checks the same limits. */
export function fromRetentionDraft(draft: Record<RetentionField, string>): { value: RetentionDays } | { error: string } {
  const out = {} as RetentionDays;
  for (const f of RETENTION_FIELDS) {
    const n = Number(draft[f.key]);
    if (draft[f.key].trim() === '' || !Number.isInteger(n)) return { error: `${f.label}: enter a whole number of days` };
    if (n < f.min || n > RETENTION_MAX_DAYS) return { error: `${f.label}: between ${f.min} and ${RETENTION_MAX_DAYS} days` };
    out[f.key] = n;
  }
  return { value: out };
}
