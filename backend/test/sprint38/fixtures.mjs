// Sprint 38 test data: mobiles 90000038xx, SKUs S38-, vendor 'S38 …', PIN 499380.
// Every name and number is made up. Removed by cleanup().
import { createRequire } from 'module';
import { call, login, q, redis, signUp } from '../sprint5/lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

export const PIN = '499380';
export const PROBE_ROLE = 's38_app_probe';
const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const people = {
  admin: person('9000003801', 'S38 Super Admin'), opsAdmin: person('9000003802', 'S38 Ops Admin'),
  pharmacist: person('9000003803', 'S38 Pharmacist'), packer: person('9000003804', 'S38 Packer'),
  buyer: person('9000003805', 'S38 Buyer'), partner: person('9000003806', 'S38 Partner login'),
  doctor: { customer_type: 'doc_hospital', practitioner_declaration: true, full_name: 'Dr. S38', mobile: '9000003807', password: 'Passw0rd!',
    pincode: '422003', nmc_reg_number: 'MMC-S38-01', nmc_council_state: 'Maharashtra Medical Council',
    speciality: 'General Physician', pan_number: 'ABCDE3838G', gst_unregistered_declaration: true, ...consent },
};
export const P = {};
export const ids = {};
export const t = {};
export const V = {};
export const addr = {};

/** A plain superuser session (no maintenance role): for checks and for test-only tampering helpers. */
export async function plainClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S38-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S38 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  // The emergency stop is open again whatever happened
  await run(`UPDATE app_settings SET value = '{"paused": false}' WHERE key = 'sales.rx_pause' AND value->>'paused' = 'true'`);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM h1_register WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM rx_dispense_ledger WHERE order_id = ANY($1) OR prescription_id IN (SELECT id FROM prescriptions WHERE user_id = ANY($2))', [orderIds, userIds]);
  await run('UPDATE order_items SET prescription_id = NULL WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE orders SET requested_prescription_id = NULL WHERE id = ANY($1)', [orderIds]);
  await run('DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE user_id = ANY($1))', [userIds]);
  await run('DELETE FROM prescriptions WHERE user_id = ANY($1)', [userIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id = ANY($1))', [userIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await run('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [userIds]);
  await run('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL WHERE pharmacist_pack_id = ANY($1) OR cancelled_by = ANY($1)', [userIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR action LIKE 's38_%'`, [productIds]);
  for (const tbl of ['wallet_transactions', 'cart_items', 'carts', 'notifications', 'orders', 'audit_logs', 'consent_records', 'addresses', 'party_licences', 'user_profiles']) {
    await run(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await run('DELETE FROM doctor_profiles WHERE user_id = ANY($1)', [userIds]).catch(() => {});
  await run('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await run('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await run('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendor_pharmacists WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM party_licences WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM invoice_series WHERE prefix LIKE 'S38%' OR series_key = ANY($1)`, [vendorIds.map((v) => `P:${v}`)]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
  for (const p of Object.values(people)) await redis.del(`otp:${p.mobile}`);
  // The probe login (the API's privileges, nothing more) is created per run
  const c = await plainClient();
  try {
    await c.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN DROP ROLE ${PROBE_ROLE}; END IF; END $$`);
    await c.query(`DROP TRIGGER IF EXISTS s38_fail_audit ON audit_logs`);
    await c.query(`DROP FUNCTION IF EXISTS s38_fail_audit()`);
  } finally { await c.end(); }
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'admin' WHERE id = $1`, [ids.opsAdmin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S38-1' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET role = 'partner' WHERE id = $1`, [ids.partner]);
  for (const k of Object.keys(people)) if (k !== 'doctor') t[k] = await login(people[k]);

  const decl = { net_quantity: '10 tablets', manufacturer_name: 'S38 Remedies Pvt Ltd', manufacturer_address: 'Plot 38, MIDC Satpur, Nashik 422007' };
  const mk = async (sku, extra = {}) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name: `S38 ${sku}`, sku, category: 'Smoke', drug_schedule: 'OTC',
      gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 5, ...decl, ...extra } });
    if (r.status !== 201) throw new Error(`product ${sku}: ${JSON.stringify(r.json)}`);
    return r.json.data.id;
  };
  P.h1 = await mk('S38-H1', { drug_schedule: 'Schedule H1' });      // Dawabag's stock
  P.h1p = await mk('S38-H1P', { drug_schedule: 'Schedule H1' });    // the partner's stock
  P.rx = await mk('S38-RX', { drug_schedule: 'Schedule H' });
  P.otc = await mk('S38-OTC');
  for (const p of [P.h1, P.rx, P.otc]) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'S38-B1', 200, 5000, CURRENT_DATE + 400)`, [p]);
  }
  V.a = (await q(`INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type,
       approval_status, is_active, invoice_prefix, drug_license_expiry)
     VALUES ('S38 River Pharmacy', 'MH-S38-RIVER-20', '27ABCDE3838F1Z5', $1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 'marketplace_partner',
       'approved', TRUE, 'S38A', CURRENT_DATE + 700) RETURNING id`, [PIN]))[0].id;
  await licencePartner(q, V.a);
  await q(`INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2)`, [V.a, ids.partner]);
  V.pharmacist = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no) VALUES ($1, 'S38 River Pharmacist', 'MSPC-S38-P1') RETURNING id`, [V.a]))[0].id;
  const pp = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted)
     VALUES ($1, $2, 'S38 S38-H1P', 'approved', 'live', TRUE) RETURNING id`, [V.a, P.h1p]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S38-PB1', 200, CURRENT_DATE + 400)`, [V.a, pp]);
  addr.buyer = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S38 Buyer', '9000003899', '38 River Road', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
}

let pay = 0;
/** Places an order and marks it paid as payment capture does ('rx_pending' with a prescription line). */
export async function paidOrder(items, status = 'rx_pending') {
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items } });
  const o = r.json.data?.order;
  if (!o) throw new Error(`order not placed: ${JSON.stringify(r.json)}`);
  pay++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at, method)
           VALUES ($1, $2, $3, 'captured', $4, NOW(), 'upi')`, [o.id, `order_S38_${pay}_${Date.now()}`, `pay_S38_${pay}_${Date.now()}`, o.total_paise]);
  await q(`UPDATE orders SET status = $2 WHERE id = $1`, [o.id, status]);
  const shipments = await q(`SELECT id, seller_type FROM order_shipments WHERE order_id = $1`, [o.id]);
  return { order: o, own: shipments.find((s) => s.seller_type === 'dawabag')?.id, partner: shipments.find((s) => s.seller_type === 'partner')?.id };
}

export const rxBody = (productId, qty, extra = {}) => ({
  prescriber_name: 'Dr. S38 Rao', prescriber_reg_no: 'MMC-S38-77', prescriber_address: 'Rao Clinic, 38 College Road, Nashik 422005',
  prescribed_on: new Date(Date.now() - 864e5).toISOString().slice(0, 10), patient_name: 'S38 Buyer', valid_days: 90,
  items: [{ product_id: productId, prescribed_qty: qty }], ...extra,
});

/** Uploads (inserts) a prescription for the order and verifies it through the API. */
export async function verifiedRx(orderId, productId, qty, body = {}) {
  const rx = (await q(`INSERT INTO prescriptions (user_id, order_id, s3_key, file_type) VALUES ($1, $2, 'test/s38.jpg', 'jpg') RETURNING id`, [ids.buyer, orderId]))[0].id;
  const r = await call('POST', `/fulfilment/prescriptions/${rx}/verify`, { token: t.pharmacist, body: rxBody(productId, qty, body) });
  return { rx, r };
}
