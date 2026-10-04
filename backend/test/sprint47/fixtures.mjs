// Sprint 47 smoke test data: mobiles 90000047xx, SKUs S47-, vendor 'S47 %', pincode 499947.
// Every name, item and number below is a made-up DEMO value (no real business data, no real
// partner products). Removed by cleanup().
import { createRequire } from 'module';
import { API, login, q, signUp } from '../sprint5/lib.mjs';

const require = createRequire(import.meta.url);
export const ExcelJS = require('exceljs');
const { Client } = require('pg');

export const PIN = '499947';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000004701', 'S47 Admin'),
  superAdmin: person('9000004702', 'S47 Super Admin'),
  pharmacist: person('9000004703', 'S47 Pharmacist Asha'),
  pharmacistLapsed: person('9000004704', 'S47 Pharmacist Lapsed'),
  consumer: person('9000004705', 'S47 Consumer'),
  doctor: person('9000004706', 'S47 Doctor Rao'),
  doctorPending: person('9000004707', 'S47 Doctor Pending'),
  retailer: person('9000004708', 'S47 Retail Owner'),
  retailerLapsed: person('9000004709', 'S47 Lapsed Retail Owner'),
};
export const ids = {};
export const t = {};
export const P = {};
export const V = {};
export const addr = {};

/** Demo products: an open one, two to restrict, one restricted later (refills), drafts for the form and import. */
const PRODUCTS = {
  open: ['S47-OPEN', 'S47 Demoopen 500 Tablet'],
  hosp: ['S47-HOSP', 'S47 Hospitase Demo Injection'],
  trade: ['S47-TRADE', 'S47 Tradeline Demo Injection'],
  later: ['S47-LATER', 'S47 Laterlock Demo Tablet'],
};
export const ITEMS = {
  draftA: ['S47 DEMOSUGG 10 INJ', '1 VIAL', 'S47DEMO'],
  draftB: ['S47 DEMOPLAIN 5 TAB', '10 TAB', 'S47DEMO'],
  draftC: ['S47 DEMOBAD 1 TAB', '10 TAB', 'S47DEMO'],
};

async function productIds() {
  return (await q(`SELECT id FROM products WHERE sku LIKE 'S47-%'`)).map((r) => r.id);
}

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S47 %'`)).map((r) => r.id);
  const products = await productIds();
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  await q('DELETE FROM refill_items WHERE subscription_id IN (SELECT id FROM refill_subscriptions WHERE user_id = ANY($1))', [userIds]);
  await q('UPDATE orders SET refill_subscription_id = NULL WHERE id = ANY($1)', [orderIds]);
  await q('DELETE FROM refill_subscriptions WHERE user_id = ANY($1)', [userIds]);
  await q('UPDATE order_edits SET written_order_id = NULL WHERE order_id = ANY($1)', [orderIds]).catch(() => {});
  await q('DELETE FROM written_orders WHERE user_id = ANY($1)', [userIds]);
  await q('DELETE FROM order_edits WHERE order_id = ANY($1)', [orderIds]).catch(() => {});
  await q('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM partner_order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM payment_webhook_events WHERE order_ref IN (SELECT gateway_order_id FROM payments WHERE order_id = ANY($1))', [orderIds]);
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM rx_dispense_ledger WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM stock_movements WHERE order_id = ANY($1)', [orderIds]).catch(() => {});
  await q('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL WHERE id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM orders WHERE id = ANY($1)', [orderIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR new_value->>'vendor_id' = ANY($2::text[])
             OR new_value->>'subscription_id' IN (SELECT id::text FROM refill_subscriptions WHERE user_id = ANY($3))`, [products, vendorIds, userIds]);
  await q('DELETE FROM catalogue_draft_suggestions WHERE product_id = ANY($1) OR partner_id = ANY($2)', [products, vendorIds]);
  await q('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, products]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await q('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [userIds]);
  await q('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [userIds]);
  for (const tbl of ['notification_deliveries', 'notifications', 'cart_items', 'carts', 'addresses', 'consent_records', 'audit_logs',
    'pharmacist_registrations', 'party_licences', 'kyc_documents', 'prescriptions', 'user_profiles']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await q(`UPDATE products SET content_reviewed_by = NULL, online_sale_set_by = NULL, buyer_restriction_set_by = NULL
           WHERE content_reviewed_by = ANY($1) OR online_sale_set_by = ANY($1) OR buyer_restriction_set_by = ANY($1)`, [userIds]);
  await q('DELETE FROM product_buyer_restriction_log WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM product_online_status_log WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [products]);
  await q('DELETE FROM products WHERE id = ANY($1)', [products]);
  await q('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

async function liveProduct([sku, name]) {
  const id = (await q(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, catalogue_state, is_active,
                           manufacturer_name, manufacturer_address, country_of_origin, net_quantity, strength, dosage_form, max_qty_per_order,
                           online_sale_status, online_sale_ref, online_sale_ref_date, online_sale_reason, online_sale_set_at)
     VALUES ($1, 'S47 Demogeneric', $2, 'S47 Demo', 'OTC', 12, '30049047', 10000, 9000, 'live', TRUE,
             'S47 Demo Labs Pvt Ltd', 'Plot 47, Demo Estate, Nashik', 'India', '1 pack', '10 mg', 'Tablet', 50,
             'permitted', 'Smoke test fixture', CURRENT_DATE, 'Smoke test fixture', NOW()) RETURNING id`, [name, sku]))[0].id;
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
           VALUES ($1, 'S47-B1', 500, 5000, CURRENT_DATE + 400)`, [id]);
  return id;
}

/** item_key exactly as the partner stock import builds it (partnerStockImport/normalise.ts itemKey, no item code). */
export function itemKey([name, pack, company]) {
  const clean = (v) => String(v ?? '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9%.]+/g, ' ').trim().replace(/\s+/g, ' ');
  return `name:${clean(name)}|${clean(pack)}|${clean(company)}`.slice(0, 400);
}

/** A draft product as Sprint 29 leaves it, linked to the partner's item; `ready` fills every field approval needs. */
async function draftProduct(sku, item, partnerId, ready = false) {
  const id = (await q(
    `INSERT INTO products (name, sku, category, drug_schedule, gst_rate, marketed_by, net_quantity, mrp_paise, offer_price_paise,
                           is_active, catalogue_state, content_status, country_of_origin, cold_chain, manufacturer_name, manufacturer_address,
                           generic_name, strength, dosage_form, hsn_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1500, 1500, FALSE, 'draft', 'pending_review', 'India', FALSE, 'S47 Demo Labs Pvt Ltd', 'Plot 47, Demo Estate, Nashik',
             $8, $9, $10, $11) RETURNING id`,
    [item[0], sku, ready ? 'S47 Demo' : null, ready ? 'Schedule H' : null, ready ? 12 : null, item[2], item[1],
     ready ? 'S47 Demosugg' : null, ready ? '10 mg' : null, ready ? 'Injection' : null, ready ? '30049047' : null]))[0].id;
  await q(`INSERT INTO catalogue_drafts (product_id, source, from_file, cold_chain_decided) VALUES ($1, 'partner_request', $2, $3)`,
    [id, JSON.stringify({ partner_id: partnerId, partner_name: 'S47', item_name: item[0], pack: item[1], company: item[2], gst_rate: null, mrp_paise: 1500 }), ready]);
  await q(`INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source) VALUES ($1, $2, $3, $4, 'admin')`,
    [partnerId, itemKey(item), id, item[0]]);
  return id;
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.superAdmin]);
  // Registered pharmacists: one in date, one whose registration lapsed (Sprint 39 gate)
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S47-MSPC-0001' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S47-MSPC-0002' WHERE id = $1`, [ids.pharmacistLapsed]);
  for (const [k, till] of [['pharmacist', 'CURRENT_DATE + 365'], ['pharmacistLapsed', 'CURRENT_DATE - 1']]) {
    await q(`INSERT INTO pharmacist_registrations (user_id, state_council, registration_no, valid_till, status, status_note, verified_at)
             VALUES ($1, 'S47 Demo State Pharmacy Council', $2, ${till}, 'active', 'Smoke test fixture', NOW())`,
      [ids[k], k === 'pharmacist' ? 'S47-MSPC-0001' : 'S47-MSPC-0002']);
  }
  // Doctors (Sprint 44): one verified with the certificate copy and in date, one not verified yet
  await q(`UPDATE users SET customer_type = 'doc_hospital', kyc_status = 'approved', kyc_approved_at = NOW(), practitioner_kind = 'doctor',
             nmc_reg_number = 'S47-MMC-0001', nmc_council_state = 'S47 Demo Medical Council', nmc_doctor_name_as_per_register = 'S47 Doctor Rao',
             nmc_status = 'verified', nmc_valid_till = CURRENT_DATE + 365, nmc_verified_at = NOW(),
             nmc_certificate_key = 'kyc/s47/nmc_certificate/demo.pdf', nmc_status_note = 'Smoke test fixture' WHERE id = $1`, [ids.doctor]);
  await q(`UPDATE users SET customer_type = 'doc_hospital', kyc_status = 'approved', kyc_approved_at = NOW(), practitioner_kind = 'doctor',
             nmc_reg_number = 'S47-MMC-0002', nmc_council_state = 'S47 Demo Medical Council', nmc_status = 'pending' WHERE id = $1`, [ids.doctorPending]);
  // Retailers (Sprint 30 / 32): one with checked, in-date Form 20 + 21; one whose Form 20 lapsed yesterday
  await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', business_name = 'S47 Demo Medical' WHERE id = ANY($1)`,
    [[ids.retailer, ids.retailerLapsed]]);
  for (const f of ['dl20', 'dl21']) {
    await q(`INSERT INTO party_licences (user_id, form, licence_number, valid_upto, status, verified_at) VALUES ($1, $2, $3, CURRENT_DATE + 300, 'verified', NOW())`,
      [ids.retailer, f, `S47-RT-${f.toUpperCase()}-0001`]);
  }
  await q(`INSERT INTO party_licences (user_id, form, licence_number, valid_upto, status, verified_at) VALUES ($1, 'dl20', 'S47-RT-DL20-0002', CURRENT_DATE - 1, 'verified', NOW())`,
    [ids.retailerLapsed]);
  for (const k of ['consumer', 'doctor', 'doctorPending', 'retailer', 'retailerLapsed']) {
    addr[k] = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
       VALUES ($1, 'S47 Demo', $2, '47 Demo Road', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [ids[k], people[k].mobile, PIN]))[0].id;
  }
  for (const [k, def] of Object.entries(PRODUCTS)) P[k] = await liveProduct(def);
  V.partner = (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                          invoice_prefix, drug_license_type, drug_license_expiry)
     VALUES ('S47 Demo Partner', 'DL-S47-A', '27ABCDE4747F1Z5', $1, 'Nashik', 'Maharashtra', 20.0, 73.8, 'marketplace_partner', 'approved', TRUE,
             'S47A', 'dl20b', CURRENT_DATE + 500) RETURNING id`, [PIN]))[0].id;
  P.draftA = await draftProduct('S47-DA', ITEMS.draftA, V.partner, true);
  P.draftB = await draftProduct('S47-DB', ITEMS.draftB, V.partner);
  P.draftC = await draftProduct('S47-DC', ITEMS.draftC, V.partner);
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
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
export async function refused(client, sql, params) {
  try { await client.query(sql, params); return null; } catch (e) { return { code: e.code, message: e.message }; }
}

export const HEAD = ['item_name', 'pack', 'company', 'generic_name', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain',
  'product_class', 'is_new_drug', 'category', 'hsn_code', 'gst_rate', 'confidence', 'note'];

/** A suggestion row (in `head` order) for an item; `over` replaces columns by name. */
export const suggestion = (item, over = {}, head = HEAD) => {
  const base = { generic_name: 'S47 Demosugg', strength: '10 mg', dosage_form: 'Injection', drug_schedule: 'Schedule H', cold_chain: 'no',
    product_class: 'drug', is_new_drug: 'no', category: 'S47 Demo', hsn_code: '30049047', gst_rate: '12', confidence: 'high', note: 'Demo note' };
  const v = { item_name: item[0], pack: item[1], company: item[2], ...base, ...over };
  return head.map((h) => v[h] ?? '');
};

export async function workbook(rows, head = HEAD) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('suggestions');
  ws.addRow(head);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function upload(token, buffer, partnerId) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'demo_suggestions.xlsx');
  form.append('partner_id', partnerId);
  const res = await fetch(`${API}/catalogue-suggestions/imports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
