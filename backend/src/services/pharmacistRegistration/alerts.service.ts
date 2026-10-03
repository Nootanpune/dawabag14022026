// Daily reminders before a pharmacist registration lapses (Sprint 39): 30 days before
// and on the day, once per threshold (reset when a renewal's new valid-till is recorded).
// Admins are told about every pharmacist; for a partner's pharmacist, the partner's
// owner login(s) too. Blocking is not done here — every gate reads the registration
// live, so an expired one stops on the day (gate.service).
import { query } from '../../config/database';
import { queueNotification } from '../notification.service';
import { REGISTRATION_ALERT_DAYS } from './rules';

const when = (d: number) => (d < 0 ? `expired ${-d} day(s) ago` : d === 0 ? 'expires today' : `expires in ${d} day(s)`);
const MAX = REGISTRATION_ALERT_DAYS[0];

export async function runPharmacistRegistrationAlerts() {
  const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE AND deleted_at IS NULL`);
  const staff = await query<any>(
    `SELECT r.user_id, r.registration_no, to_char(r.valid_till, 'YYYY-MM-DD') AS valid_till, r.last_alert_days,
            (r.valid_till - CURRENT_DATE) AS days_left, up.full_name
     FROM pharmacist_registrations r JOIN users u ON u.id = r.user_id LEFT JOIN user_profiles up ON up.user_id = r.user_id
     WHERE r.valid_till IS NOT NULL AND r.valid_till <= CURRENT_DATE + ${MAX} AND r.status = 'active'
       AND u.role = 'pharmacist_rx' AND u.is_active AND u.deleted_at IS NULL`);
  const partners = await query<any>(
    `SELECT vp.id, vp.vendor_id, vp.full_name, vp.registration_no, to_char(vp.valid_till, 'YYYY-MM-DD') AS valid_till, vp.last_alert_days,
            (vp.valid_till - CURRENT_DATE) AS days_left, v.name AS partner_name
     FROM vendor_pharmacists vp JOIN vendors v ON v.id = vp.vendor_id
     WHERE vp.valid_till IS NOT NULL AND vp.valid_till <= CURRENT_DATE + ${MAX} AND vp.registration_status = 'active'
       AND vp.is_active AND v.is_active`);
  const level = (daysLeft: number, last: number | null) => {
    const l = REGISTRATION_ALERT_DAYS.filter((d) => daysLeft <= d).pop();
    return l === undefined || (last !== null && last <= l) ? null : l;
  };
  let alerted = 0;
  for (const s of staff) {
    const l = level(Number(s.days_left), s.last_alert_days);
    if (l === null) continue;
    const text = `Pharmacist ${s.full_name || ''} (registration ${s.registration_no}) ${when(Number(s.days_left))} (valid till ${s.valid_till}). `
      + 'From that day they cannot verify prescriptions, check orders or approve medicine information until the renewal is recorded '
      + '(Admin → Pharmacist registrations).';
    for (const a of admins) await queueNotification({ userId: a.id, type: 'pharmacist_registration_expiring', text });
    await queueNotification({ userId: s.user_id, type: 'pharmacist_registration_expiring',
      text: `Your pharmacy council registration ${s.registration_no} ${when(Number(s.days_left))} (valid till ${s.valid_till}). Send the renewal to a Dawabag admin.` });
    await query(`UPDATE pharmacist_registrations SET last_alert_days = $2 WHERE user_id = $1`, [s.user_id, l]);
    alerted++;
  }
  for (const p of partners) {
    const l = level(Number(p.days_left), p.last_alert_days);
    if (l === null) continue;
    const text = `${p.partner_name}: pharmacist ${p.full_name} (registration ${p.registration_no}) ${when(Number(p.days_left))} (valid till ${p.valid_till}). `
      + 'From that day this pharmacist cannot release the partner\'s shipments until Dawabag records the renewal.';
    for (const a of admins) await queueNotification({ userId: a.id, type: 'pharmacist_registration_expiring', text });
    const owners = await query<{ user_id: string }>(
      `SELECT vu.user_id FROM vendor_users vu JOIN users u ON u.id = vu.user_id WHERE vu.vendor_id = $1 AND vu.is_owner AND u.is_active`, [p.vendor_id]);
    for (const o of owners) {
      await queueNotification({ userId: o.user_id, type: 'pharmacist_registration_expiring',
        text: `Your pharmacist ${p.full_name}'s registration ${p.registration_no} ${when(Number(p.days_left))} (valid till ${p.valid_till}). Send the renewal to Dawabag so they can keep releasing your orders.` });
    }
    await query(`UPDATE vendor_pharmacists SET last_alert_days = $2 WHERE id = $1`, [p.id, l]);
    alerted++;
  }
  return { staff_checked: staff.length, partner_checked: partners.length, alerted };
}
