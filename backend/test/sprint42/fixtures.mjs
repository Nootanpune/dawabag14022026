// Sprint 42 fixtures: the Sprint 39 people, products and partner (sprint39/fixtures.mjs), plus
// what this suite adds (a verified partner pharmacist, partner stock for a second product,
// licence numbers of its own). Made-up test data only; removed by cleanup().
import { q, redis } from '../sprint5/lib.mjs';
import { PP, V, cleanup as cleanup39, inDays, people, setup as setup39 } from '../sprint39/fixtures.mjs';

export const LIC = { own20: 'S42-DWB-20-OLD', own20New: 'S42-DWB-20-NEW', partner20: 'S42-LAKE-20-OLD', partner20New: 'S42-LAKE-20-NEW' };
export const saved = {};

export async function cleanup() {
  await q(`UPDATE app_settings SET value = '"optional"', updated_by = NULL WHERE key = 'security.two_factor'`);
  if (saved.own20) await q(`UPDATE business_licences SET licence_number = $2, valid_upto = $3 WHERE id = $1`, [saved.own20.id, saved.own20.number, saved.own20.valid_upto]);
  delete saved.own20;
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  await q('DELETE FROM user_recovery_codes WHERE user_id = ANY($1)', [userIds]);
  await q('DELETE FROM user_two_factor WHERE user_id = ANY($1)', [userIds]);
  for (const id of userIds) await redis.del(`2fa_wrong:${id}`);
  await cleanup39();
  for (const p of Object.values(people)) await redis.del(`otp:${p.mobile}`, `otp_wrong:${p.mobile}`, `otp_gap:${p.mobile}`, `otp_sends:${p.mobile}`);
}

export async function setup() {
  await setup39();
  // The partner's pharmacist recorded and verified (Sprint 39 rules), and stock of a second product
  await q(`UPDATE vendor_pharmacists SET state_council = 'Maharashtra State Pharmacy Council', valid_till = $2, registration_status = 'active',
             verified_at = NOW() WHERE id = $1`, [V.pharmacist, inDays(365)]);
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S42-PB2', 300, CURRENT_DATE + 400)`, [V.a, PP.feed]);
  // Licence numbers of this suite: Dawabag's Form 20 (restored afterwards) and the partner's Form 20
  const own = (await q(`SELECT id, licence_number, valid_upto FROM business_licences WHERE licence_type = 'retail_20' AND is_active ORDER BY created_at LIMIT 1`))[0];
  if (!own) throw new Error('Dawabag has no Form 20 in its licence register (scripts/dev-up.sh adds placeholders)');
  saved.own20 = { id: own.id, number: own.licence_number, valid_upto: own.valid_upto };
  // valid longest, so it is the Form 20 a line is sold under even if the register holds another
  await q(`UPDATE business_licences SET licence_number = $2, valid_upto = CURRENT_DATE + 3650 WHERE id = $1`, [own.id, LIC.own20]);
  await q(`UPDATE party_licences SET licence_number = $2 WHERE vendor_id = $1 AND form = 'dl20' AND status = 'verified'`, [V.a, LIC.partner20]);
}
