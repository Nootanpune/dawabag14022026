// Sprint 8 test data: mobiles 90000008xx, SKU prefix S8-, pincode 499981
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499981';
export const people = {
  admin: person('9000000801', 'S8 Admin'), packer: person('9000000802', 'S8 Packer'),
  buyer: person('9000000803', 'S8 Buyer'), buyer2: person('9000000804', 'S8 Buyer Two'),
};
// Settings this suite changes, put back afterwards
const SETTINGS = { 'courier.provider': 'manual', 'sms.dlt_templates': {}, 'delivery.handover_code_scope': 'rx_only' };

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S8-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  for (const [k, v] of Object.entries(SETTINGS)) await run('UPDATE app_settings SET value = $2, updated_by = NULL WHERE key = $1', [k, JSON.stringify(v)]);
  await run('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE orders SET pharmacist_pack_id = NULL WHERE pharmacist_pack_id = ANY($1)', [ids]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'user_devices', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await run(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await run('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const r = await call('POST', '/products', { token: t.admin, body: { name: 'S8 Pain Relief Tablet', sku: 'S8-OTC', category: 'Smoke', drug_schedule: 'OTC',
    gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 50,
    net_quantity: '10 tablets', manufacturer_name: 'S8 Pharma', manufacturer_address: 'Plot 8, MIDC Satpur, Nashik 422007' } });
  check('product created', r.status === 201, r.json);
  const P = { otc: r.json.data?.id };
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
           VALUES ($1, 'S8-B1', 500, 5000, CURRENT_DATE + 400)`, [P.otc]);
  const addr = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S8 Buyer', '9000000899', '8 Test Lane', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
  return { ids, t, P, addr };
}

let pay = 0;
// A paid order with one shipment, ready for packing
export async function paidOrder({ t, P, addr }) {
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr, pincode: PIN, items: [{ product_id: P.otc, quantity: 1 }] } });
  const o = r.json.data?.order;
  pay++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at)
           VALUES ($1, $2, $3, 'captured', $4, NOW())`, [o.id, `order_S8_${pay}_${Date.now()}`, `pay_S8_${pay}_${Date.now()}`, o.total_paise]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]);
  const s = (await q(`SELECT id FROM order_shipments WHERE order_id = $1`, [o.id]))[0];
  return { order: o, shipmentId: s.id };
}

// Waits for the notification queue (worker inside the API) to log a delivery
export async function waitFor(sql, params, ok = (rows) => rows.length > 0, ms = 15000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) {
    rows = await q(sql, params);
    if (ok(rows)) return rows;
    await new Promise((r) => setTimeout(r, 250));
  }
  return rows;
}
