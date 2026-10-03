// Sprint 39 test data: mobiles 90000039xx, SKUs S39-, vendor 'S39 …', PIN 499390.
// Every name and number is made up. Removed by cleanup().
import { createRequire } from 'module';
import { call, login, q, redis, signUp } from '../sprint5/lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

export const PIN = '499390';
const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const people = {
  admin: person('9000003901', 'S39 Super Admin'), opsAdmin: person('9000003902', 'S39 Ops Admin'),
  pharmacist: person('9000003903', 'S39 Pharmacist'), pharmacistB: person('9000003904', 'S39 Second Pharmacist'),
  pharmacistNew: person('9000003905', 'S39 New Pharmacist'), packer: person('9000003906', 'S39 Packer'),
  buyer: person('9000003907', 'S39 Buyer'), other: person('9000003908', 'S39 Other Buyer'),
  partner: person('9000003909', 'S39 Partner owner'),
};
export const P = {};
export const ids = {};
export const t = {};
export const V = {};
export const PP = {};
export const addr = {};
export const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const inDays = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

/** A plain superuser session (no maintenance role): the database's own refusals are checked with it. */
export async function plainClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S39-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S39 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run(`UPDATE app_settings SET value = 'false' WHERE key = 'partner_stock.provenance_required'`);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM h1_register WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await run('DELETE FROM payment_webhook_events WHERE order_ref IN (SELECT gateway_order_id FROM payments WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM rx_dispense_ledger WHERE order_id = ANY($1) OR prescription_id IN (SELECT id FROM prescriptions WHERE user_id = ANY($2))', [orderIds, userIds]);
  await run('UPDATE order_items SET prescription_id = NULL WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE orders SET requested_prescription_id = NULL WHERE id = ANY($1)', [orderIds]);
  await run('DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE user_id = ANY($1))', [userIds]);
  await run('DELETE FROM prescriptions WHERE user_id = ANY($1)', [userIds]);
  await run('DELETE FROM stock_movements WHERE order_id = ANY($1)', [orderIds]).catch(() => {});
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id = ANY($1))', [userIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await run('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [userIds]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [userIds]).catch(() => {});
  await run('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL WHERE pharmacist_pack_id = ANY($1) OR cancelled_by = ANY($1)', [userIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR new_value->>'vendor_id' = ANY($2::text[])`, [productIds, vendorIds]);
  await run('DELETE FROM product_info_versions WHERE product_id = ANY($1)', [productIds]).catch(() => {});
  await run('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [productIds]);
  for (const tbl of ['wallet_transactions', 'cart_items', 'carts', 'notifications', 'orders', 'audit_logs', 'consent_records', 'addresses', 'user_profiles']) {
    await run(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await run('DELETE FROM partner_feed_checks WHERE partner_id = ANY($1)', [vendorIds]).catch(() => {});
  await run('DELETE FROM partner_stock_feeds WHERE partner_id = ANY($1)', [vendorIds]).catch(() => {});
  await run('DELETE FROM partner_stock_imports WHERE partner_id = ANY($1)', [vendorIds]).catch(() => {});
  await run('DELETE FROM partner_api_keys WHERE partner_id = ANY($1)', [vendorIds]).catch(() => {});
  await run('DELETE FROM partner_import_mappings WHERE partner_id = ANY($1)', [vendorIds]).catch(() => {});
  await run('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendorIds, productIds]);
  await run('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await run('DELETE FROM partner_batch_provenance WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendor_pharmacists WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM party_licences WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM invoice_series WHERE prefix LIKE 'S39%' OR series_key = ANY($1)`, [vendorIds.map((v) => `P:${v}`)]);
  await run('DELETE FROM pharmacist_registrations WHERE user_id = ANY($1)', [userIds]);
  await run('UPDATE products SET content_reviewed_by = NULL, online_sale_set_by = NULL WHERE content_reviewed_by = ANY($1) OR online_sale_set_by = ANY($1)', [userIds]);
  await run('UPDATE product_info_versions SET reviewed_by = NULL WHERE reviewed_by = ANY($1)', [userIds]).catch(() => {});
  await run('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run(`DELETE FROM product_categories WHERE name = 'S39 Smoke'`).catch(() => {});
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
  for (const p of Object.values(people)) await redis.del(`otp:${p.mobile}`);
}

const decl = { net_quantity: '10 tablets', manufacturer_name: 'S39 Remedies Pvt Ltd', manufacturer_address: 'Plot 39, MIDC Ambad, Nashik 422010' };
/** A new product through the admin's form — it starts 'restricted' (Sprint 39). */
export async function newProduct(sku, extra = {}) {
  const r = await call('POST', '/products', { token: t.admin, body: { name: `S39 ${sku}`, sku, category: 'S39 Smoke', drug_schedule: 'OTC',
    gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 5, ...decl, ...extra } });
  if (r.status !== 201) throw new Error(`product ${sku}: ${JSON.stringify(r.json)}`);
  return r.json.data;
}

export const verifyStaff = (userId, regNo, extra = {}) => call('PUT', `/pharmacist-registrations/staff/${userId}`, { token: t.opsAdmin,
  body: { state_council: 'Maharashtra State Pharmacy Council', registration_no: regNo, valid_till: inDays(365), status: 'active', verified: true, ...extra } });

export const permit = (productIds, token = t.pharmacist) => call('POST', '/online-sale/products/bulk', { token,
  body: { product_ids: productIds, status: 'permitted', notification_ref: 'S39 test approval ref 1', notification_date: today() } });

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.opsAdmin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S39-1' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S39-2' WHERE id = $1`, [ids.pharmacistB]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S39-3' WHERE id = $1`, [ids.pharmacistNew]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET role = 'partner' WHERE id = $1`, [ids.partner]);
  for (const k of Object.keys(people)) t[k] = await login(people[k]);
  // The admin records and verifies two of the pharmacists (the third stays unrecorded)
  for (const [k, reg] of [['pharmacist', 'MSPC-S39-1'], ['pharmacistB', 'MSPC-S39-2']]) {
    const r = await verifyStaff(ids[k], reg);
    if (r.status !== 200) throw new Error(`registration ${k}: ${JSON.stringify(r.json)}`);
  }

  P.otc = (await newProduct('S39-OTC')).id;
  P.rx = (await newProduct('S39-RX', { drug_schedule: 'Schedule H' })).id;
  P.h1p = (await newProduct('S39-H1P', { drug_schedule: 'Schedule H1' })).id;      // only the partner holds it
  P.cold = (await newProduct('S39-COLD', { cold_chain: true, storage_instructions: 'Store at 2–8 °C' })).id;
  P.feed = (await newProduct('S39-FEED')).id;
  const r = await permit([P.otc, P.rx, P.h1p, P.cold, P.feed]);
  if (r.status !== 200) throw new Error(`permit: ${JSON.stringify(r.json)}`);
  for (const p of [P.otc, P.rx]) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'S39-B1', 300, 5000, CURRENT_DATE + 400)`, [p]);
  }
  V.a = (await q(`INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type,
       approval_status, is_active, invoice_prefix, drug_license_expiry)
     VALUES ('S39 Lake Pharmacy', 'MH-S39-LAKE-20', '27ABCDE3939F1Z5', $1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 'marketplace_partner',
       'approved', TRUE, 'S39A', CURRENT_DATE + 700) RETURNING id`, [PIN]))[0].id;
  await licencePartner(q, V.a);
  await q(`INSERT INTO vendor_users (vendor_id, user_id, is_owner) VALUES ($1, $2, TRUE)`, [V.a, ids.partner]);
  // Added without council / validity: unverified until the admin records it (test registrations.mjs does)
  V.pharmacist = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no) VALUES ($1, 'S39 Lake Pharmacist', 'MSPC-S39-P1') RETURNING id`, [V.a]))[0].id;
  for (const [key, cold] of [['h1p', false], ['cold', true], ['feed', false]]) {
    PP[key] = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted, cold_chain,
         h1_pharmacist_name, h1_pharmacist_reg_no, h1_secure_storage_declared)
       VALUES ($1, $2, $3, 'approved', 'live', TRUE, $4, 'S39 Lake Pharmacist', 'MSPC-S39-P1', TRUE) RETURNING id`, [V.a, P[key], `S39 ${key}`, cold]))[0].id;
  }
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S39-PB1', 300, CURRENT_DATE + 400)`, [V.a, PP.h1p]);
  addr.buyer = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S39 Buyer', '9000003999', '39 Lake Road', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
}

/** A pending prescription the buyer uploaded (not yet with an order). */
export async function uploadedRx(userId = ids.buyer) {
  return (await q(`INSERT INTO prescriptions (user_id, s3_key, original_filename, file_type) VALUES ($1, 'test/s39.jpg', 'rx.jpg', 'jpg') RETURNING id`, [userId]))[0].id;
}

/** Places an order (with a freshly uploaded prescription when withRx). */
export async function placeOrder(items, { withRx = true, token = t.buyer, address = addr.buyer } = {}) {
  const body = { address_id: address, pincode: PIN, items, ...(withRx ? { prescription_id: await uploadedRx() } : {}) };
  const r = await call('POST', '/orders', { token, body });
  return { r, order: r.json.data?.order };
}

export const shipmentsOf = async (orderId) => {
  const rows = await q(`SELECT id, seller_type, pharmacist_check, status FROM order_shipments WHERE order_id = $1`, [orderId]);
  return { own: rows.find((s) => s.seller_type === 'dawabag')?.id, partner: rows.find((s) => s.seller_type === 'partner')?.id };
};

export const rxBody = (productId, qty, extra = {}) => ({
  prescriber_name: 'Dr. S39 Kale', prescriber_reg_no: 'MMC-S39-77', prescriber_address: 'Kale Clinic, 39 College Road, Nashik 422005',
  prescribed_on: new Date(Date.now() - 864e5).toISOString().slice(0, 10), patient_name: 'S39 Buyer', valid_days: 90,
  items: [{ product_id: productId, prescribed_qty: qty }], ...extra,
});

/** The prescription attached to an order (the one sent with it at checkout). */
export const rxOf = async (orderId) => (await q(`SELECT id FROM prescriptions WHERE order_id = $1 AND status = 'pending' ORDER BY created_at LIMIT 1`, [orderId]))[0]?.id;

export const payment = async (orderId) => (await q(
  `SELECT status, capture_mode, gateway, gateway_payment_id, authorised_at, release_due_at, gateway_expires_at, captured_at, released_at, release_reason
   FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]))[0];
export const orderRow = async (orderId) => (await q(`SELECT status, cancellation_reason FROM orders WHERE id = $1`, [orderId]))[0];
