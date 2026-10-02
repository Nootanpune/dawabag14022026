// Sprint 13 test data: mobiles 90000013xx, SKU S13-, vendor 'S13 %', pincode 499913
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { releaseInDb } from '../support/pharmacistCheck.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499913';
export const people = {
  admin: person('9000001301', 'S13 Admin'), packer: person('9000001302', 'S13 Packer'), rider1: person('9000001303', 'S13 Rider One'),
  rider2: person('9000001304', 'S13 Rider Two'), buyer: person('9000001305', 'S13 Buyer'),
};
const SETTINGS = { 'whatsapp.templates': {}, 'accounts.locked_until': null };

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S13-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S13 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  for (const [k, v] of Object.entries(SETTINGS)) await run('UPDATE app_settings SET value = $2, updated_by = NULL WHERE key = $1', [k, JSON.stringify(v)]);
  await run('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  await run('UPDATE inventory_batches SET grn_line_id = NULL WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM grn_lines WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM goods_receipts WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE orders SET pharmacist_pack_id = NULL WHERE pharmacist_pack_id = ANY($1)', [ids]);
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

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days) VALUES ($1, 'Nashik', 'Maharashtra', 20.01, 73.79, 12, 1)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET role = 'delivery' WHERE id = ANY($1)`, [[ids.rider1, ids.rider2]]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const r = await call('POST', '/products', { token: t.admin, body: { name: 'S13 Antacid Gel', sku: 'S13-OTC', category: 'Smoke', drug_schedule: 'OTC',
    gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, max_qty_per_order: 50,
    net_quantity: '200 ml', manufacturer_name: 'S13 Pharma', manufacturer_address: 'Plot 13, MIDC Satpur, Nashik 422007' } });
  check('product created', r.status === 201, r.json);
  const P = { otc: r.json.data?.id };
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date) VALUES ($1, 'S13-B1', 500, 5000, CURRENT_DATE + 400)`, [P.otc]);
  const V = (await q(`INSERT INTO vendors (name, drug_license_no, drug_license_expiry, gst_number, pincode, city, state, vendor_type, approval_status, is_active)
     VALUES ('S13 Supplier', 'DL-S13-1', CURRENT_DATE + 400, '27AAACS1313A1Z5', '422007', 'Nashik', 'Maharashtra', 'supplier', 'approved', TRUE) RETURNING id`))[0].id;
  const addr = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S13 Buyer', '9000001399', '13 Lake Road', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
  return { ids, t, P, V, addr };
}

let pay = 0;
export async function packedOrder({ t, P, addr }) {
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr, pincode: PIN, items: [{ product_id: P.otc, quantity: 1 }] } });
  const o = r.json.data.order;
  pay++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at) VALUES ($1, $2, $3, 'captured', $4, NOW())`,
    [o.id, `order_S13_${pay}_${Date.now()}`, `pay_S13_${pay}_${Date.now()}`, o.total_paise]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]);
  const s = (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [o.id]))[0];
  await releaseInDb(q, s.id);   // Sprint 35: a pharmacist has checked it (C-08); this suite is about riders
  await call('POST', `/fulfilment/shipments/${s.id}/pack`, { token: t.packer });
  return { order: o, shipmentId: s.id };
}

export async function waitFor(sql, params, ok = (rows) => rows.length > 0, ms = 15000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) { rows = await q(sql, params); if (ok(rows)) return rows; await new Promise((r) => setTimeout(r, 250)); }
  return rows;
}
