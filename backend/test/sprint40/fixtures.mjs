// Sprint 40 test data: mobiles 90000040xx, SKUs S40-, vendors 'S40 …', PIN 499400.
// Every name and number is made up. Removed by cleanup().
import { createRequire } from 'module';
import { call, login, q, redis, signUp } from '../sprint5/lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

export const PIN = '499400';
const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const people = {
  admin: person('9000004001', 'S40 Super Admin'), opsAdmin: person('9000004002', 'S40 Ops Admin'),
  pharmacist: person('9000004003', 'S40 Pharmacist'), lapsed: person('9000004004', 'S40 Lapsed Pharmacist'),
  packer: person('9000004005', 'S40 Packer'), buyer: person('9000004006', 'S40 Buyer'), buyer2: person('9000004007', 'S40 Second Buyer'),
  partner: person('9000004008', 'S40 Partner owner'), partnerB: person('9000004009', 'S40 Other Partner owner'),
};
export const P = {};
export const ids = {};
export const t = {};
export const V = {};
export const PP = {};
export const B = {};
export const addr = {};
export const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const inDays = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

/** A plain superuser session (no maintenance role): the database's own refusals are checked with it. */
export async function plainClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

/** Notifications are written by the queue a moment later */
export async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if ((Array.isArray(v) ? v.length : v) || Date.now() > end) return v; await new Promise((r) => setTimeout(r, 250)); }
}
export const noted = (userId, type) => waitFor(() => q(`SELECT title, body FROM notifications WHERE user_id = $1 AND type = $2`, [userId, type]));

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S40-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S40 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  // Test database only: the integrity check's start point and recorded heads of this run
  await run(`DELETE FROM app_settings WHERE key = 'integrity.chain_start'`);
  await run('DELETE FROM chain_heads');
  await run('DELETE FROM recall_drills WHERE product_id = ANY($1) OR started_by = ANY($2)', [productIds, userIds]);
  await run('DELETE FROM self_inspections WHERE inspected_by = ANY($1)', [userIds]);   // results, actions, history cascade
  await run(`DELETE FROM self_inspection_templates WHERE name LIKE 'S40 %'`);
  await run('UPDATE self_inspection_templates SET created_by = NULL, updated_by = NULL WHERE created_by = ANY($1) OR updated_by = ANY($1)', [userIds]);
  await run('DELETE FROM gdp_records WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM stock_adjustments WHERE batch_id IN (SELECT id FROM inventory_batches WHERE product_id = ANY($1))', [productIds]);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM payment_webhook_events WHERE order_ref IN (SELECT gateway_order_id FROM payments WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM h1_register WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await run('DELETE FROM rx_dispense_ledger WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM prescriptions WHERE user_id = ANY($1)', [userIds]);
  await run('DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id = ANY($1))', [userIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await run('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [userIds]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [userIds]).catch(() => {});
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR new_value->>'vendor_id' = ANY($2::text[])`, [productIds, vendorIds]);
  for (const tbl of ['cart_items', 'carts', 'notifications', 'orders', 'audit_logs', 'consent_records', 'addresses', 'user_profiles']) {
    await run(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await run('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await run('DELETE FROM partner_batch_provenance WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendor_pharmacists WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('UPDATE inventory_batches SET grn_line_id = NULL WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM grn_lines WHERE grn_id IN (SELECT id FROM goods_receipts WHERE vendor_id = ANY($1))', [vendorIds]);
  await run('DELETE FROM goods_receipts WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM party_licences WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('UPDATE inventory_batches SET vendor_id = NULL WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM invoice_series WHERE prefix LIKE 'S40%' OR series_key = ANY($1)`, [vendorIds.map((v) => `P:${v}`)]);
  await run('DELETE FROM pharmacist_registrations WHERE user_id = ANY($1)', [userIds]);
  await run('UPDATE products SET content_reviewed_by = NULL, online_sale_set_by = NULL, new_drug_confirmed_by = NULL WHERE content_reviewed_by = ANY($1) OR online_sale_set_by = ANY($1) OR new_drug_confirmed_by = ANY($1)', [userIds]);
  await run('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM product_online_status_log WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run(`DELETE FROM product_categories WHERE name = 'S40 Smoke'`).catch(() => {});
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
  for (const p of Object.values(people)) await redis.del(`otp:${p.mobile}`);
}

const decl = { net_quantity: '10 tablets', manufacturer_name: 'S40 Remedies Pvt Ltd', manufacturer_address: 'Plot 40, MIDC Ambad, Nashik 422010' };
/** A new product through the admin's form — it starts 'restricted'. */
export async function newProduct(sku, extra = {}) {
  const r = await call('POST', '/products', { token: t.admin, body: { name: `S40 ${sku}`, sku, category: 'S40 Smoke', drug_schedule: 'OTC',
    gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 5, ...decl, ...extra } });
  if (r.status !== 201) throw new Error(`product ${sku}: ${JSON.stringify(r.json)}`);
  return r.json.data;
}

export const permit = (productIds, extra = {}, token = t.pharmacist) => call('POST', '/online-sale/products/bulk', { token,
  body: { product_ids: productIds, status: 'permitted', notification_ref: 'S40 test approval ref 1', notification_date: today(), ...extra } });

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days, cold_chain_available)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2, TRUE)`, [PIN]);
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.opsAdmin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S40-1' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S40-2' WHERE id = $1`, [ids.lapsed]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET role = 'partner' WHERE id = ANY($1)`, [[ids.partner, ids.partnerB]]);
  for (const k of Object.keys(people)) t[k] = await login(people[k]);
  // A verified, in-date registration and a lapsed one (Sprint 39 registry)
  await q(`INSERT INTO pharmacist_registrations (user_id, state_council, registration_no, valid_till, status, verified_at, verified_by)
           VALUES ($1, 'Maharashtra State Pharmacy Council', 'MSPC-S40-1', CURRENT_DATE + 365, 'active', NOW(), $3),
                  ($2, 'Maharashtra State Pharmacy Council', 'MSPC-S40-2', CURRENT_DATE - 1, 'active', NOW() - INTERVAL '400 days', $3)`,
  [ids.pharmacist, ids.lapsed, ids.opsAdmin]);

  P.cold = (await newProduct('S40-COLD', { cold_chain: true, storage_instructions: 'Store at 2–8 °C, do not freeze' })).id;
  P.cold2 = (await newProduct('S40-COLD2', { cold_chain: true, storage_instructions: 'Store at 2–8 °C' })).id;
  P.coldp = (await newProduct('S40-COLDP', { cold_chain: true, storage_instructions: 'Store at 2–8 °C' })).id;   // only the partner holds it
  P.drill = (await newProduct('S40-DRILL')).id;
  P.grn = (await newProduct('S40-GRN', { cold_chain: true, storage_instructions: 'Refrigerate 2–8 °C' })).id;
  const r = await permit([P.cold, P.cold2, P.coldp, P.drill, P.grn]);
  if (r.status !== 200) throw new Error(`permit: ${JSON.stringify(r.json)}`);
  const batch = async (productId, no, qty) => (await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date, storage_location)
     VALUES ($1, $2, $3, 5000, CURRENT_DATE + 400, 'S40 Cold room 1') RETURNING id`, [productId, no, qty]))[0].id;
  B.cold = await batch(P.cold, 'S40-C1', 40);
  B.cold2 = await batch(P.cold2, 'S40-C2', 30);
  B.drill = await batch(P.drill, 'S40-D1', 50);

  const vendor = async (name, lic, gst, prefix) => (await q(`INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type,
       approval_status, is_active, invoice_prefix, drug_license_expiry)
     VALUES ($1, $2, $3, $4, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 'marketplace_partner', 'approved', TRUE, $5, CURRENT_DATE + 700) RETURNING id`,
  [name, lic, gst, PIN, prefix]))[0].id;
  V.a = await vendor('S40 Hill Pharmacy', 'MH-S40-HILL-20', '27ABCDE4040F1Z5', 'S40A');
  V.b = await vendor('S40 Vale Pharmacy', 'MH-S40-VALE-20', '27ABCDE4041F1Z5', 'S40B');
  for (const v of [V.a, V.b]) await licencePartner(q, v);
  await q(`INSERT INTO vendor_users (vendor_id, user_id, is_owner) VALUES ($1, $2, TRUE), ($3, $4, TRUE)`, [V.a, ids.partner, V.b, ids.partnerB]);
  V.pharmacist = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no, state_council, valid_till, verified_at)
     VALUES ($1, 'S40 Hill Pharmacist', 'MSPC-S40-P1', 'Maharashtra State Pharmacy Council', CURRENT_DATE + 365, NOW()) RETURNING id`, [V.a]))[0].id;
  V.lapsedPharmacist = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no, state_council, valid_till, verified_at)
     VALUES ($1, 'S40 Hill Lapsed Pharmacist', 'MSPC-S40-P2', 'Maharashtra State Pharmacy Council', CURRENT_DATE - 1, NOW() - INTERVAL '400 days') RETURNING id`, [V.a]))[0].id;
  for (const [key, cold] of [['coldp', true], ['drill', false]]) {
    PP[key] = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted, cold_chain)
       VALUES ($1, $2, $3, 'approved', 'live', TRUE, $4) RETURNING id`, [V.a, P[key], `S40 ${key}`, cold]))[0].id;
  }
  B.partnerCold = (await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date, cold_chain_confirmed)
           VALUES ($1, $2, 'S40-PC1', 20, CURRENT_DATE + 400, TRUE) RETURNING id`, [V.a, PP.coldp]))[0].id;
  // A supplier for the goods receipt (licensed, C-02)
  V.supplier = (await q(`INSERT INTO vendors (name, drug_license_no, drug_license_expiry, gst_number, pincode, city, state, vendor_type, approval_status, is_active)
     VALUES ('S40 Supplier', 'DL-S40-1', CURRENT_DATE + 400, '27AAACS4040A1Z5', '422007', 'Nashik', 'Maharashtra', 'supplier', 'approved', TRUE) RETURNING id`))[0].id;
  await licencePartner(q, V.supplier);
  for (const k of ['buyer', 'buyer2']) {
    addr[k] = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
       VALUES ($1, $2, '9000004099', '40 Hill Road', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [ids[k], `S40 ${k}`, PIN]))[0].id;
  }
}

let pays = 0;
/** Places an order (no prescription lines) and marks it paid, ready for the pharmacist check. */
export async function paidOrder(items, who = 'buyer') {
  const r = await call('POST', '/orders', { token: t[who], body: { address_id: addr[who], pincode: PIN, items } });
  const o = r.json.data?.order;
  if (!o) return { r };
  pays++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at, method)
           VALUES ($1, $2, $3, 'captured', $4, NOW(), 'upi')`, [o.id, `order_S40_${pays}_${Date.now()}`, `pay_S40_${pays}_${Date.now()}`, o.total_paise]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]);
  const shipments = await q(`SELECT id, seller_type FROM order_shipments WHERE order_id = $1`, [o.id]);
  return { r, order: o, own: shipments.find((s) => s.seller_type === 'dawabag')?.id, partner: shipments.find((s) => s.seller_type === 'partner')?.id };
}

/** The partner's batch with the same number as Dawabag's (the drill's second seller). */
export async function addPartnerDrillBatch() {
  B.partnerDrill = (await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date, storage_location)
           VALUES ($1, $2, 'S40-D1', 25, CURRENT_DATE + 400, 'Hill shelf 4') RETURNING id`, [V.a, PP.drill]))[0].id;
}
