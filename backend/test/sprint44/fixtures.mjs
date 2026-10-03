// Sprint 44 fixtures: the Sprint 43 set (Sprint 39 people, products and partner; the partner's
// verified pharmacist and its stock of S39-FEED, which Dawabag does not hold) plus a doctor
// account (doc_hospital). Made-up test data only (mobiles 90000039xx); removed by cleanup().
import { q } from '../sprint5/lib.mjs';
import { cleanup as cleanup43, setup as setup43 } from '../sprint43/fixtures.mjs';
import { PIN, addr, ids, people } from '../sprint39/fixtures.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
// Added to the Sprint 39 people so its sign-up, sign-in and clean-up cover the doctor too
people.doctor = {
  customer_type: 'doc_hospital', practitioner_declaration: true, full_name: 'Dr. S44 Asha Rao', mobile: '9000003944', password: 'Passw0rd!',
  pincode: PIN, nmc_reg_number: 'MMC-S44-01', nmc_council_state: 'Maharashtra Medical Council', speciality: 'General Physician',
  pan_number: 'ABCDE4444H', gst_unregistered_declaration: true, ...consent,
};

export async function cleanup() {
  const like = `SELECT id FROM users WHERE mobile LIKE '90000039%'`;
  await q(`UPDATE order_edits SET written_order_id = NULL WHERE written_order_id IN (SELECT id FROM written_orders WHERE user_id IN (${like}))`);
  await q(`DELETE FROM written_orders WHERE user_id IN (${like})`);
  await q(`DELETE FROM payment_webhook_events WHERE order_ref IN (SELECT gateway_order_id FROM payments WHERE order_edit_id IS NOT NULL
             AND order_id IN (SELECT id FROM orders WHERE user_id IN (${like})))`);
  await q(`DELETE FROM refunds WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (${like}))`);
  await q(`DELETE FROM payments WHERE order_edit_id IS NOT NULL AND order_id IN (SELECT id FROM orders WHERE user_id IN (${like}))`);
  await q(`DELETE FROM kyc_documents WHERE user_id IN (${like})`);
  await q(`DELETE FROM kyc_verifications WHERE user_id IN (${like})`);
  await cleanup43();
}

export async function setup() {
  await setup43();
  addr.doctor = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S44 Rao Clinic', '9000003998', '44 Clinic Road', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.doctor, PIN]))[0].id;
  // KYC approved (PAN and the account checks are Sprint 2's subject); the registration is NOT verified yet
  await q(`UPDATE users SET kyc_status = 'approved', kyc_approved_at = NOW() WHERE id = $1`, [ids.doctor]);
}
