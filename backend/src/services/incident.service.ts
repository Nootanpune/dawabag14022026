// src/services/incident.service.ts — security incident register (Rulebook C-43)
// CERT-In must hear of a reportable incident within 6 hours of detection; a
// personal-data breach is also notified to the Data Protection Board and the
// affected users. The register shows each deadline and whether it was met.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { queueNotification } from './notification.service';
import { istYear } from '../utils/ist';

export const CATEGORIES = ['data_breach', 'unauthorised_access', 'malware', 'phishing', 'service_outage', 'payment_fraud', 'lost_device', 'other'] as const;
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

const COLUMNS = `i.*, i.detected_at + INTERVAL '6 hours' AS cert_in_due_at,
  (i.cert_in_reported_at IS NULL AND NOW() > i.detected_at + INTERVAL '6 hours') AS cert_in_overdue,
  (i.cert_in_reported_at IS NOT NULL AND i.cert_in_reported_at > i.detected_at + INTERVAL '6 hours') AS cert_in_late,
  up.full_name AS reported_by_name`;

export async function createIncident(adminId: string, input: {
  title: string; category: typeof CATEGORIES[number]; severity: typeof SEVERITIES[number]; description: string;
  personal_data_affected: boolean; detected_at: string;
}) {
  if (new Date(input.detected_at).getTime() > Date.now() + 60_000) throw new AppError('Detection time cannot be in the future', 400);
  return withTransaction(async (client) => {
    const n = (await client.query(`SELECT nextval('security_incident_seq') AS n`)).rows[0].n;
    const no = `SEC-${istYear()}-${String(n).padStart(4, '0')}`;
    const row = (await client.query(
      `INSERT INTO security_incidents (incident_no, title, category, severity, description, personal_data_affected, detected_at, reported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, incident_no, detected_at, detected_at + INTERVAL '6 hours' AS cert_in_due_at`,
      [no, input.title, input.category, input.severity, input.description, input.personal_data_affected, input.detected_at, adminId])).rows[0];
    await writeAuditTx(client, { userId: null, action: 'security_incident_logged', performedBy: adminId,
      newValue: { incident_id: row.id, incident_no: no, severity: input.severity, category: input.category } });
    const supers = (await client.query(`SELECT id FROM users WHERE role = 'super_admin' AND is_active AND deleted_at IS NULL`)).rows;
    for (const s of supers) await queueNotification({ userId: s.id, type: 'security_incident', incidentNo: no, severity: input.severity, dueAt: row.cert_in_due_at });
    return row;
  });
}

export async function listIncidents(status?: string) {
  return query(
    `SELECT ${COLUMNS} FROM security_incidents i LEFT JOIN user_profiles up ON up.user_id = i.reported_by
     ${status ? 'WHERE i.status = $1' : ''} ORDER BY i.detected_at DESC LIMIT 200`, status ? [status] : []);
}

export async function getIncident(id: string) {
  const r = await queryOne(`SELECT ${COLUMNS} FROM security_incidents i LEFT JOIN user_profiles up ON up.user_id = i.reported_by WHERE i.id = $1`, [id]);
  if (!r) throw new AppError('Incident not found', 404);
  return r;
}

export async function updateIncident(adminId: string, id: string, input: {
  status?: 'open' | 'contained' | 'closed'; cert_in_reported_at?: string; cert_in_reference?: string;
  dpb_notified_at?: string; users_notified_at?: string; actions_taken?: string;
}) {
  return withTransaction(async (client) => {
    const cur = (await client.query('SELECT * FROM security_incidents WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw new AppError('Incident not found', 404);
    if (cur.status === 'closed') throw new AppError('Incident is closed', 409);
    const next = { ...cur, ...input };
    if (input.cert_in_reported_at && !next.cert_in_reference) throw new AppError('Enter the CERT-In acknowledgement reference', 400);
    if (input.status === 'closed') {
      if (!next.actions_taken) throw new AppError('Describe the actions taken before closing', 400);
      if (cur.personal_data_affected && (!next.dpb_notified_at || !next.users_notified_at)) {
        throw new AppError('A personal-data breach is closed only after the Data Protection Board and users are notified', 400);
      }
    }
    await client.query(
      `UPDATE security_incidents SET status = $2, cert_in_reported_at = $3, cert_in_reference = $4, dpb_notified_at = $5,
         users_notified_at = $6, actions_taken = $7, closed_at = CASE WHEN $2::varchar = 'closed' THEN NOW() ELSE closed_at END,
         updated_at = NOW() WHERE id = $1`,
      [id, next.status, next.cert_in_reported_at, next.cert_in_reference, next.dpb_notified_at, next.users_notified_at, next.actions_taken]);
    await writeAuditTx(client, { userId: null, action: 'security_incident_updated', performedBy: adminId, newValue: { incident_id: id, ...input } });
    return { id, status: next.status };
  });
}
