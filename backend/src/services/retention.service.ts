// Storage limitation (DPDP Act s.8(7); C-44): operational data is deleted once its
// retention period (setting retention.days) has passed. Statutory and evidential
// records — invoices, credit notes, H1 register, prescriptions and e-prescriptions,
// e-invoices, goods receipts, consent and audit logs — are never touched here;
// they follow the record-keeping periods in the runbook (C-34). Sprint 34 adds the
// Taken / Skipped answers and ended dose reminders, and (only if set) health profiles
// of long-inactive accounts; erasure and export of both are in privacy.service (C-43).
import { query } from '../config/database';
import { writeAudit } from '../utils/audit';
import { getSetting } from './settings.service';

const BATCH = 10_000;
// Proof that buyers were told of a recall is kept with the recall record (C-28, C-34)
const KEEP = `'batch_recall'`;

// key → the delete for rows older than $1 days (bounded per run); one row returned per row removed
const PURGES: Record<string, string> = {
  notification_deliveries: `DELETE FROM notification_deliveries WHERE id IN (
      SELECT id FROM notification_deliveries WHERE created_at < NOW() - make_interval(days => $1)
        AND type NOT IN (${KEEP}) LIMIT ${BATCH}) RETURNING 1`,
  // In-app inbox copies (the delivery log above is the record of sending)
  notifications: `DELETE FROM notifications WHERE id IN (
      SELECT n.id FROM notifications n WHERE n.sent_at < NOW() - make_interval(days => $1) AND n.type NOT IN (${KEEP})
        AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id = n.id) LIMIT ${BATCH}) RETURNING 1`,
  payment_webhook_events: `DELETE FROM payment_webhook_events WHERE event_id IN (
      SELECT event_id FROM payment_webhook_events WHERE received_at < NOW() - make_interval(days => $1) LIMIT ${BATCH}) RETURNING 1`,
  job_runs: `DELETE FROM job_runs WHERE id IN (
      SELECT id FROM job_runs WHERE started_at < NOW() - make_interval(days => $1) LIMIT ${BATCH}) RETURNING 1`,
  // A cart nobody has touched for the period is emptied
  abandoned_carts: `DELETE FROM cart_items WHERE user_id IN (
      SELECT c.user_id FROM carts c WHERE c.updated_at < NOW() - make_interval(days => $1)
        AND EXISTS (SELECT 1 FROM cart_items ci WHERE ci.user_id = c.user_id) LIMIT ${BATCH}) RETURNING 1`,
  // Phones not seen for the period stop receiving pushes
  stale_devices: `DELETE FROM user_devices WHERE id IN (
      SELECT id FROM user_devices WHERE last_seen_at < NOW() - make_interval(days => $1) LIMIT ${BATCH}) RETURNING 1`,
  // Sprint 34 — "My medicines" (Sprint 33) is the buyer's own health-related data, nothing
  // statutory: Taken / Skipped answers older than the period (default 2 years) …
  reminder_dose_logs: `DELETE FROM reminder_dose_logs WHERE id IN (
      SELECT id FROM reminder_dose_logs WHERE scheduled_for < NOW() - make_interval(days => $1) LIMIT ${BATCH}) RETURNING 1`,
  // … and reminders that ended (end date passed, or switched off) that long ago, with their answers
  ended_reminders: `DELETE FROM medicine_reminders WHERE id IN (
      SELECT id FROM medicine_reminders
      WHERE (end_date IS NOT NULL AND end_date < CURRENT_DATE - $1::int)
         OR (NOT is_active AND updated_at < NOW() - make_interval(days => $1))
      LIMIT ${BATCH}) RETURNING 1`,
  // Health profiles are kept until the buyer withdraws consent or asks for erasure (C-43).
  // Only if an admin sets this period: the health details of accounts not signed in, and
  // not updated, for that long are deleted (family members' allergies / conditions / age
  // wiped; the people themselves stay where an order names them). Unset by default.
  inactive_health_profiles: `WITH stale AS (
        SELECT h.user_id FROM health_profiles h JOIN users u ON u.id = h.user_id
        WHERE h.updated_at < NOW() - make_interval(days => $1)
          AND COALESCE(u.last_login_at, u.created_at) < NOW() - make_interval(days => $1)
        LIMIT ${BATCH}),
      wiped AS (
        UPDATE patients SET allergies = '[]', conditions = '[]', age_years = NULL, age_recorded_on = NULL
        WHERE owner_user_id IN (SELECT user_id FROM stale) RETURNING 1)
      DELETE FROM health_profiles WHERE user_id IN (SELECT user_id FROM stale) RETURNING 1`,
};
export const RETENTION_KEYS = Object.keys(PURGES);

/** The shortest period an admin may set for each key; health profiles at least a year. */
export const RETENTION_MIN_DAYS: Record<string, number> = { payment_webhook_events: 180, inactive_health_profiles: 365 };
export const retentionMinDays = (key: string) => RETENTION_MIN_DAYS[key] ?? 30;

export async function runRetentionPurge(): Promise<Record<string, unknown>> {
  const days = await getSetting<Record<string, number>>('retention.days', {});
  const deleted: Record<string, number> = {};
  for (const [key, sql] of Object.entries(PURGES)) {
    const d = Number(days[key]);
    if (!Number.isInteger(d) || d < retentionMinDays(key)) continue;   // unset or unsafe: keep everything
    deleted[key] = (await query(sql, [d])).length;
  }
  await writeAudit({ userId: null, action: 'retention_purge', performedBy: null, newValue: { deleted, days } });
  return { deleted };
}
