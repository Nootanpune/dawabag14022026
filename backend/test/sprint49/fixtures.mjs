// Sprint 49 smoke test data: mobiles 90000049xx, SKUs S49-, vendor 'S49 %'. Every name and
// number is a made-up DEMO value (no real business data). Removed by cleanup().
import { createRequire } from 'module';
import { login, q, signUp } from '../sprint5/lib.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000004901', 'S49 Admin'),
  superAdmin: person('9000004902', 'S49 Super Admin'),
  pharmacist: person('9000004903', 'S49 Pharmacist Verified'),
  pharmacistNew: person('9000004904', 'S49 Pharmacist Unrecorded'),
  packer: person('9000004905', 'S49 Packer Enrolled'),
  consumer: person('9000004906', 'S49 Consumer'),
  doctor: person('9000004907', 'S49 Doctor Pending'),
};
export const ids = {};
export const t = {};
export const P = {};
export const V = {};
/** The manual item the test edits, and its value before the test (restored by cleanup). */
export const MANUAL_KEY = '1.2';
export const saved = {};

async function userIds() {
  return (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
}

export async function cleanup() {
  const users = await userIds();
  const vendors = (await q(`SELECT id FROM vendors WHERE name LIKE 'S49 %'`)).map((r) => r.id);
  const products = (await q(`SELECT id FROM products WHERE sku LIKE 'S49-%'`)).map((r) => r.id);
  if (saved.manual) {
    await q('UPDATE launch_checklist_items SET status = $2, note = $3, updated_by = $4, updated_at = $5 WHERE item_key = $1',
      [MANUAL_KEY, saved.manual.status, saved.manual.note, saved.manual.updated_by, saved.manual.updated_at]);
  }
  await q('UPDATE launch_checklist_items SET updated_by = NULL WHERE updated_by = ANY($1)', [users]);
  if (saved.couriers !== undefined) await q('UPDATE app_settings SET value = $2 WHERE key = $1', ['delivery.cold_chain_couriers', JSON.stringify(saved.couriers)]);
  await q(`DELETE FROM job_runs WHERE job_name = 'db_backup' AND summary->>'key' LIKE 's49/%'`);
  await q(`DELETE FROM payment_webhook_events WHERE event_id LIKE 'evt_S49%'`);
  await q('DELETE FROM audit_logs WHERE performed_by = ANY($1) OR user_id = ANY($1)', [users]);
  await q('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [users]);
  await q('DELETE FROM product_info_versions WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM catalogue_draft_suggestions WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM product_buyer_restriction_log WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM product_online_status_log WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM products WHERE id = ANY($1)', [products]);
  await q('DELETE FROM vendor_pharmacists WHERE vendor_id = ANY($1)', [vendors]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendors]);
  for (const tbl of ['user_recovery_codes', 'user_two_factor', 'pharmacist_registrations', 'notification_deliveries', 'notifications',
    'consent_records', 'user_profiles']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [users]);
  }
  await q('DELETE FROM users WHERE id = ANY($1)', [users]);
}

async function product(sku, name, extra = {}) {
  const v = { catalogue_state: 'live', is_active: true, online_sale_status: 'permitted', schedule_c_c1: false, buyer_restriction: 'everyone',
    restriction_by: null, ...extra };
  return (await q(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, catalogue_state, is_active,
                           manufacturer_name, manufacturer_address, country_of_origin, net_quantity, strength, dosage_form, content_status,
                           online_sale_status, online_sale_reason, online_sale_set_at, schedule_c_c1,
                           buyer_restriction, buyer_restriction_reason, buyer_restriction_set_by, buyer_restriction_set_at)
     VALUES ($1, 'S49 Demogeneric', $2, ${v.catalogue_state === 'live' ? `'S49 Demo'` : 'NULL'}, ${v.catalogue_state === 'live' ? `'OTC'` : 'NULL'},
             ${v.catalogue_state === 'live' ? 12 : 'NULL'}, '30049049', 10000, 9000, $3, $4,
             'S49 Demo Labs Pvt Ltd', 'Plot 49, Demo Estate, Nashik', 'India', '1 pack', '10 mg', 'Tablet', 'approved',
             $5, 'Smoke test fixture', NOW(), $6, $7, $8, $9, CASE WHEN $9::uuid IS NULL THEN NULL ELSE NOW() END) RETURNING id`,
    [name, sku, v.catalogue_state, v.is_active, v.online_sale_status, v.schedule_c_c1, v.buyer_restriction,
     v.restriction_by ? 'Smoke test fixture: supplied to licensed trade only' : null, v.restriction_by]))[0].id;
}

/** The admin first: the test reads the counts before the other fixtures exist. */
export async function setupAdmin() {
  ids.admin = (await signUp(people.admin)).user_id;
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.admin]);
  t.admin = await login(people.admin);
}

export async function setup() {
  for (const [k, p] of Object.entries(people)) if (k !== 'admin') ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.superAdmin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S49-MSPC-0001' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S49-MSPC-0002' WHERE id = $1`, [ids.pharmacistNew]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET customer_type = 'doc_hospital', practitioner_kind = 'doctor', nmc_reg_number = 'S49-MMC-0001',
             nmc_council_state = 'S49 Demo Medical Council', nmc_status = 'pending' WHERE id = $1`, [ids.doctor]);
  // One Dawabag pharmacist verified and in date; the other has no registration recorded
  await q(`INSERT INTO pharmacist_registrations (user_id, state_council, registration_no, valid_till, status, status_note, verified_at, verified_by)
           VALUES ($1, 'S49 Demo State Pharmacy Council', 'S49-MSPC-0001', CURRENT_DATE + 365, 'active', 'Smoke test fixture', NOW(), $2)`,
    [ids.pharmacist, ids.admin]);
  // The packer uses two-step sign-in (a stand-in secret: this login never signs in here)
  await q(`INSERT INTO user_two_factor (user_id, secret_enc, status, confirmed_at) VALUES ($1, 'S49-not-a-real-secret', 'active', NOW())`, [ids.packer]);
  // A partner with two pharmacists: one verified and in date, one not verified
  V.partner = (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                          invoice_prefix, drug_license_type, drug_license_expiry)
     VALUES ('S49 Demo Partner', 'DL-S49-A', '27ABCDE4949F1Z5', '499949', 'Nashik', 'Maharashtra', 20.0, 73.8, 'marketplace_partner', 'approved', TRUE,
             'S49A', 'dl20b', CURRENT_DATE + 500) RETURNING id`))[0].id;
  await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no, state_council, valid_till, registration_status, verified_at, verified_by)
           VALUES ($1, 'S49 Partner Pharmacist One', 'S49-PMSPC-1', 'S49 Demo Council', CURRENT_DATE + 200, 'active', NOW(), $2),
                  ($1, 'S49 Partner Pharmacist Two', 'S49-PMSPC-2', NULL, NULL, 'active', NULL, NULL)`, [V.partner, ids.admin]);
  // Products: live and allowed online (with approved medicine information), live but not allowed online yet
  // (Schedule C / C1, licensed trade only), and a draft with a catalogue suggestion and an imported information draft
  P.live = await product('S49-LIVE', 'S49 Demolive 10 Tablet');
  P.restricted = await product('S49-RESTR', 'S49 Demorestr 10 Injection',
    { online_sale_status: 'restricted', schedule_c_c1: true, buyer_restriction: 'trade_only', restriction_by: ids.pharmacist });
  P.draft = await product('S49-DRAFT', 'S49 DEMODRAFT 5 TAB', { catalogue_state: 'draft', is_active: false, online_sale_status: 'restricted' });
  await q(`INSERT INTO catalogue_drafts (product_id, source, from_file, cold_chain_decided) VALUES ($1, 'partner_request', $2, FALSE)`,
    [P.draft, JSON.stringify({ partner_id: V.partner, partner_name: 'S49', item_name: 'S49 DEMODRAFT 5 TAB', pack: '10 TAB', company: 'S49DEMO' })]);
  await q(`INSERT INTO catalogue_draft_suggestions (product_id, partner_id, import_id, row_number, item_name, pack, company, suggested, confidence, note, imported_by)
           VALUES ($1, $2, gen_random_uuid(), 2, 'S49 DEMODRAFT 5 TAB', '10 TAB', 'S49DEMO', '{"generic_name": "S49 Demogeneric"}', 'medium', 'Demo note', $3)`,
    [P.draft, V.partner, ids.pharmacist]);
  await q(`INSERT INTO product_info_versions (product_id, version, status, content, created_by, reviewed_by, reviewed_at, reviewer_name, reviewer_reg_no)
           VALUES ($1, 1, 'approved', '{}', $2, $2, NOW(), 'S49 Pharmacist Verified', 'S49-MSPC-0001')`, [P.live, ids.pharmacist]);
  await q(`INSERT INTO product_info_versions (product_id, version, status, content, source, import_partner_id, import_meta, created_by)
           VALUES ($1, 1, 'draft', '{}', 'imported_draft', $2, '{"composition_confidence": "low", "item_name": "S49 Demorestr"}', $3)`,
    [P.restricted, V.partner, ids.admin]);
  for (const k of ['superAdmin', 'pharmacist', 'consumer']) t[k] = await login(people[k]);
}

/** A direct connection as the API's own restricted login (Sprint 41), or null when not configured. */
export async function apiLogin() {
  if (!process.env.DB_APP_LOGIN || !process.env.DB_APP_PASSWORD) return null;
  const u = new URL(process.env.DATABASE_URL);
  u.username = process.env.DB_APP_LOGIN; u.password = process.env.DB_APP_PASSWORD;
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  return c;
}
