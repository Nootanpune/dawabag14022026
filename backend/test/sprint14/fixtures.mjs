// Sprint 14 test data: mobiles 90000014xx, SKU S14-, vendor 'S14 %', alerts 'S14 %', pincode 499914
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499914';
export const people = { admin: person('9000001401', 'S14 Admin'), buyer: person('9000001402', 'S14 Buyer'), doctor: person('9000001403', 'S14 Doctor') };

const SETTINGS = { 'whatsapp.templates': {}, 'accounts.locked_until': null };

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S14-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S14 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const alertIds = (await q(`SELECT id FROM recall_alerts WHERE reference LIKE 'S14 %'`)).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run('DELETE FROM consultations WHERE patient_user_id = ANY($1)', [ids]);
  await run('DELETE FROM doctor_profiles WHERE user_id = ANY($1)', [ids]);
  await run('DELETE FROM recall_alert_matches WHERE line_id IN (SELECT id FROM recall_alert_lines WHERE alert_id = ANY($1))', [alertIds]);
  await run('DELETE FROM recall_alert_lines WHERE alert_id = ANY($1)', [alertIds]);
  await run('DELETE FROM recall_alerts WHERE id = ANY($1)', [alertIds]);
  for (const [k, v] of Object.entries(SETTINGS)) await run('UPDATE app_settings SET value = $2, updated_by = NULL WHERE key = $1', [k, JSON.stringify(v)]);
  await run('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  await run('DELETE FROM batch_recalls WHERE product_id = ANY($1)', [productIds]);
  await run('UPDATE inventory_batches SET grn_line_id = NULL WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM grn_lines WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM goods_receipts WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'user_devices', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await run(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await run('UPDATE vendors SET approved_by = NULL WHERE id = ANY($1)', [vendorIds]);
  await run('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

async function product(t, name, sku) {
  const r = await call('POST', '/products', { token: t.admin, body: { name, sku, category: 'Smoke', drug_schedule: 'OTC',
    gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, max_qty_per_order: 50,
    net_quantity: '10 tablets', manufacturer_name: 'S14 Pharma', manufacturer_address: 'Plot 14, MIDC Satpur, Nashik 422007' } });
  check(`product ${sku} created`, r.status === 201, r.json);
  return r.json.data?.id;
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days) VALUES ($1, 'Nashik', 'Maharashtra', 20.01, 73.79, 12, 1)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const P = { para: await product(t, 'S14 Paracetamol 500', 'S14-PARA'), syrup: await product(t, 'S14 Cough Syrup', 'S14-SYRUP') };
  // Same batch number, spelt differently, on two different products
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date) VALUES ($1, 'S14/AB-77', 100, 5000, CURRENT_DATE + 400)`, [P.para]);
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date) VALUES ($1, 's14 ab 77', 40, 5000, CURRENT_DATE + 400)`, [P.syrup]);
  const V = (await q(`INSERT INTO vendors (name, drug_license_no, drug_license_expiry, gst_number, pincode, city, state, vendor_type, approval_status, is_active)
     VALUES ('S14 Supplier', 'DL-S14-1', CURRENT_DATE + 400, '27AAACS1414A1Z5', '422007', 'Nashik', 'Maharashtra', 'supplier', 'approved', TRUE) RETURNING id`))[0].id;
  const addr = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S14 Buyer', '9000001499', '14 Lake Road', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr, pincode: PIN, items: [{ product_id: P.para, quantity: 2 }] } });
  check('buyer ordered the paracetamol', r.status === 201, r.json);
  return { ids, t, P, V, order: r.json.data?.order };
}
