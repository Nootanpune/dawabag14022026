// Storage limitation (DPDP Act s.8(7); C-44): operational data is deleted once its
// retention period (setting retention.days) has passed. Statutory and evidential
// records — invoices, credit notes, H1 register, prescriptions and e-prescriptions,
// e-invoices, goods receipts, consent and audit logs — are never touched here;
// they follow the record-keeping periods in the runbook (C-34).
import { query } from '../config/database';
import { writeAudit } from '../utils/audit';
import { getSetting } from './settings.service';

const BATCH = 10_000;

// table → the delete for rows older than $1 days (bounded per run)
const PURGES: Record<string, string> = {
  notification_deliveries: `DELETE FROM notification_deliveries WHERE id IN (
      SELECT id FROM notification_deliveries WHERE created_at < NOW() - make_interval(days => $1) LIMIT ${BATCH})`,
  // In-app inbox copies (the delivery log above is the record of sending)
  notifications: `DELETE FROM notifications WHERE id IN (
      SELECT n.id FROM notifications n WHERE n.sent_at < NOW() - make_interval(days => $1)
        AND NOT EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id = n.id) LIMIT ${BATCH})`,
  payment_webhook_events: `DELETE FROM payment_webhook_events WHERE event_id IN (
      SELECT event_id FROM payment_webhook_events WHERE received_at < NOW() - make_interval(days => $1) LIMIT ${BATCH})`,
  job_runs: `DELETE FROM job_runs WHERE id IN (
      SELECT id FROM job_runs WHERE started_at < NOW() - make_interval(days => $1) LIMIT ${BATCH})`,
  // A cart nobody has touched for the period is emptied
  abandoned_carts: `DELETE FROM cart_items WHERE user_id IN (
      SELECT user_id FROM carts WHERE updated_at < NOW() - make_interval(days => $1) LIMIT ${BATCH})`,
  // Phones not seen for the period stop receiving pushes
  stale_devices: `DELETE FROM user_devices WHERE id IN (
      SELECT id FROM user_devices WHERE last_seen_at < NOW() - make_interval(days => $1) LIMIT ${BATCH})`,
};
export const RETENTION_KEYS = Object.keys(PURGES);

export async function runRetentionPurge(): Promise<Record<string, unknown>> {
  const days = await getSetting<Record<string, number>>('retention.days', {});
  const deleted: Record<string, number> = {};
  for (const [key, sql] of Object.entries(PURGES)) {
    const d = Number(days[key]);
    if (!Number.isInteger(d) || d < 30) continue;          // unset or unsafe: keep everything
    deleted[key] = (await query(`${sql} RETURNING 1`, [d])).length;
  }
  await writeAudit({ userId: null, action: 'retention_purge', performedBy: null, newValue: { deleted, days } });
  return { deleted };
}
