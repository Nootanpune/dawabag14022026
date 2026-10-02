// Daily expiry alerts for the drug licences of partners, suppliers and buyer accounts
// (Sprint 30) — the same 60 / 30 / 7 / 0-day thresholds as Dawabag's own register
// (licence.service, C-07), once per threshold per licence, reset when a renewal is
// verified. Admins are told about every party; a partner's logins and a buyer are told
// about their own licences. Blocking is not done here: every check reads the derived
// summary (earliest valid-till), so a lapsed licence stops the activity on the day —
//   partner selling (C-33), purchases from a supplier (C-02), trade buying (C-14; the
//   buyer's account also moves to pending_renewal in kyc.service's licence_expiry job).
import { query } from '../../config/database';
import { queueNotification } from '../notification.service';
import { formLabel } from './forms';

export const PARTY_ALERT_DAYS = [60, 30, 7, 0];

const when = (days: number) => (days < 0 ? `expired ${-days} day(s) ago` : days === 0 ? 'expires today' : `expires in ${days} day(s)`);

export async function runPartyLicenceAlerts() {
  const due = await query<any>(
    `SELECT p.id, p.vendor_id, p.user_id, p.form, p.form_name, p.licence_number, to_char(p.valid_upto, 'YYYY-MM-DD') AS valid_upto,
            p.last_alert_days, (p.valid_upto - CURRENT_DATE) AS days_left,
            v.name AS vendor_name, v.vendor_type, u.business_name, u.customer_type, up.full_name
     FROM party_licences p
     LEFT JOIN vendors v ON v.id = p.vendor_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN user_profiles up ON up.user_id = p.user_id
     WHERE p.status = 'verified' AND p.valid_upto IS NOT NULL AND p.valid_upto <= CURRENT_DATE + 60
       AND (p.vendor_id IS NULL OR v.is_active) AND (p.user_id IS NULL OR (u.is_active AND u.deleted_at IS NULL))`);
  const admins = await query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE AND deleted_at IS NULL`);
  let alerted = 0;
  for (const l of due) {
    const level = PARTY_ALERT_DAYS.filter((d) => l.days_left <= d).pop();
    if (level === undefined || (l.last_alert_days !== null && l.last_alert_days <= level)) continue;
    const label = formLabel(l.form, l.form_name);
    const who = l.vendor_id
      ? `${l.vendor_type === 'supplier' ? 'Supplier' : 'Partner'} ${l.vendor_name}`
      : `Buyer ${l.business_name || l.full_name || 'account'}`;
    const consequence = l.vendor_id
      ? (l.vendor_type === 'supplier' ? 'purchases from this supplier are blocked from that day' : 'it stops selling on Dawabag from that day')
      : 'trade orders are paused from that day';
    const adminText = `${who}: ${label} licence ${l.licence_number} ${when(l.days_left)} (valid till ${l.valid_upto}); ${consequence} until the renewal is verified.`;
    for (const a of admins) await queueNotification({ userId: a.id, type: 'party_licence_expiring', text: adminText });

    // The holder: a partner's logins, or the buyer account itself (suppliers have no login)
    const ownText = `Your ${label} drug licence ${l.licence_number} ${when(l.days_left)} (valid till ${l.valid_upto}). `
      + `Send the renewed licence from ${l.vendor_id ? 'the partner portal (My business)' : 'your account (Your drug licences)'} so ${
        l.vendor_id ? 'your listings stay on sale' : 'trade orders continue'}.`;
    const holders = l.vendor_id
      ? (l.vendor_type === 'supplier' ? [] : await query<{ user_id: string }>(
          `SELECT vu.user_id FROM vendor_users vu JOIN users u ON u.id = vu.user_id WHERE vu.vendor_id = $1 AND u.is_active`, [l.vendor_id]))
      : [{ user_id: l.user_id }];
    for (const h of holders) await queueNotification({ userId: h.user_id, type: 'party_licence_expiring', text: ownText });
    await query(`UPDATE party_licences SET last_alert_days = $2 WHERE id = $1`, [l.id, level]);
    alerted++;
  }
  return { checked: due.length, alerted };
}
