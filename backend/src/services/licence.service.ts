// src/services/licence.service.ts — Dawabag's own licence register (Rulebook C-07, C-01, C-02)
// Licence numbers, validity and a named renewal owner, with alerts 60, 30 and
// 7 days before expiry and on the day. Documents themselves go to S3 through
// the existing upload flow; this register is the authority for dates.
import { query, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { queueNotification, sendEmail } from './notification.service';

export const LICENCE_TYPES = ['retail_20', 'retail_21', 'wholesale_20b', 'wholesale_21b', 'gst', 'shop_establishment',
  'fssai', 'trade', 'other'] as const;
export const ALERT_DAYS = [60, 30, 7, 0];

export interface LicenceInput {
  licence_type: typeof LICENCE_TYPES[number];
  licence_number: string;
  issued_by?: string | null;
  premises?: string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
  renewal_owner: string;
  renewal_owner_email?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export async function listLicences() {
  return query(
    `SELECT *, (valid_upto - CURRENT_DATE) AS days_left,
            CASE WHEN valid_upto IS NULL THEN 'no_expiry' WHEN valid_upto < CURRENT_DATE THEN 'expired'
                 WHEN valid_upto <= CURRENT_DATE + 60 THEN 'expiring' ELSE 'valid' END AS validity
     FROM business_licences ORDER BY is_active DESC, valid_upto NULLS LAST`);
}

export async function saveLicence(adminId: string, input: LicenceInput, id?: string) {
  return withTransaction(async (client) => {
    const cols = ['licence_type', 'licence_number', 'issued_by', 'premises', 'valid_from', 'valid_upto',
      'renewal_owner', 'renewal_owner_email', 'notes', 'is_active'] as const;
    const values = cols.map((c) => (input as any)[c] ?? (c === 'is_active' ? true : null));
    let row;
    if (id) {
      const before = (await client.query(`SELECT valid_upto FROM business_licences WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new AppError('Licence not found', 404);
      row = (await client.query(
        `UPDATE business_licences SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = NOW(),
           last_alert_days = CASE WHEN valid_upto IS DISTINCT FROM $7::date THEN NULL ELSE last_alert_days END
         WHERE id = $1 RETURNING *`, [id, ...values])).rows[0];
    } else {
      row = (await client.query(
        `INSERT INTO business_licences (${cols.join(', ')}, created_by)
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}) RETURNING *`,
        [...values, adminId])).rows[0];
    }
    await writeAuditTx(client, { userId: null, action: id ? 'licence_updated' : 'licence_added', performedBy: adminId,
      newValue: { licence_id: row.id, licence_type: row.licence_type, licence_number: row.licence_number, valid_upto: row.valid_upto } });
    return row;
  });
}

// Daily job: alert at each threshold once (C-07)
export async function runLicenceRegisterAlerts() {
  const due = await query<any>(
    `SELECT id, licence_type, licence_number, premises, valid_upto, renewal_owner, renewal_owner_email, last_alert_days,
            (valid_upto - CURRENT_DATE) AS days_left
     FROM business_licences WHERE is_active AND valid_upto IS NOT NULL AND valid_upto <= CURRENT_DATE + 60`);
  const admins = await query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE AND deleted_at IS NULL`);
  let alerted = 0;
  for (const l of due) {
    // The tightest threshold reached (60 → 30 → 7 → 0); alert once per threshold
    const level = ALERT_DAYS.filter((d) => l.days_left <= d).pop();
    if (level === undefined || (l.last_alert_days !== null && l.last_alert_days <= level)) continue;
    const when = l.days_left < 0 ? `expired ${-l.days_left} day(s) ago` : l.days_left === 0 ? 'expires today' : `expires in ${l.days_left} day(s)`;
    const text = `Licence ${l.licence_type} ${l.licence_number}${l.premises ? ` (${l.premises})` : ''} ${when} (valid up to ${new Date(l.valid_upto).toISOString().slice(0, 10)}). Renewal owner: ${l.renewal_owner}.`;
    for (const a of admins) await queueNotification({ userId: a.id, type: 'business_licence_expiring', text });
    if (l.renewal_owner_email) await sendEmail(l.renewal_owner_email, `Licence renewal due: ${l.licence_type} ${l.licence_number}`, `<p>${text}</p>`);
    await query(`UPDATE business_licences SET last_alert_days = $2 WHERE id = $1`, [l.id, level]);
    alerted++;
  }
  return { checked: due.length, alerted };
}
