// Sprint 9 test data: mobiles 90000009xx, SKU prefix S9-, vendors 'S9 %', PIN codes 499991 (Karnataka buyer), 499992 (premises)
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499991', PREMISES_PIN = '499992';
export const SELLER_GSTIN = '27AAACD9999M1Z5';
export const people = {
  admin: person('9000000901', 'S9 Admin'), admin2: person('9000000902', 'S9 Accounts'), packer: person('9000000903', 'S9 Packer'),
  trader: person('9000000904', 'S9 Retailer'), trader2: person('9000000905', 'S9 Bad GSTIN Retailer'), buyer: person('9000000906', 'S9 Consumer'),
};
const KEYS = ['einvoice.enabled', 'legal.entity', 'dawabag.premises'];
let saved = null;

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S9-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S9 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const batchIds = (await q('SELECT id FROM inventory_batches WHERE product_id = ANY($1)', [productIds])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  if (saved) for (const [k, v] of Object.entries(saved)) await run('UPDATE app_settings SET value = $2, updated_by = NULL WHERE key = $1', [k, JSON.stringify(v)]);
  await run('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  await run('DELETE FROM einvoices WHERE shipment_id IN (SELECT id FROM order_shipments WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM purchase_return_lines WHERE batch_id = ANY($1)', [batchIds]);
  await run('DELETE FROM purchase_returns WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM stock_adjustments WHERE batch_id = ANY($1)', [batchIds]);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL WHERE pharmacist_pack_id = ANY($1) OR cancelled_by = ANY($1)', [ids]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'user_devices', 'wallet_transactions', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await run(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await run('UPDATE vendors SET approved_by = NULL WHERE id = ANY($1)', [vendorIds]);
  await run('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE id = ANY($1)', [batchIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = ANY($1)', [[PIN, PREMISES_PIN]]);
}

export async function setup() {
  saved = Object.fromEntries((await q(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [KEYS])).map((r) => [r.key, r.value]));
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days) VALUES
           ($1, 'Bengaluru', 'Karnataka', 12.97, 77.59, 48, 3), ($2, 'Nashik', 'Maharashtra', 20.01, 73.79, 12, 1)`, [PIN, PREMISES_PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = ANY($1)`, [[ids.admin, ids.admin2]]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', credit_limit_paise = 10000000, gstin = $2 WHERE id = $1`, [ids.trader, '29AABCS9999K1Z5']);
  await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', credit_limit_paise = 10000000, gstin = $2 WHERE id = $1`, [ids.trader2, '99AABCS9999K1Z5']);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const r = await call('POST', '/products', { token: t.admin, body: { name: 'S9 Amoxicillin Capsule', sku: 'S9-OTC', category: 'Smoke', drug_schedule: 'OTC',
    gst_rate: 12, hsn_code: '30042019', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 50,
    net_quantity: '10 capsules', manufacturer_name: 'S9 Pharma', manufacturer_address: 'Plot 9, MIDC Satpur, Nashik 422007' } });
  check('product created', r.status === 201, r.json);
  const P = { otc: r.json.data?.id };
  const supplier = async (name, gstin) => (await q(
    `INSERT INTO vendors (name, drug_license_no, drug_license_expiry, gst_number, pincode, city, state, vendor_type, approval_status, is_active)
     VALUES ($1, 'DL-' || $2, CURRENT_DATE + 400, $2, '422007', 'Nashik', 'Maharashtra', 'supplier', 'approved', TRUE) RETURNING id`, [name, gstin]))[0].id;
  const V = { a: await supplier('S9 Supplier A', '27AAACS1111A1Z5'), b: await supplier('S9 Supplier B', '27AAACS2222B1Z5') };
  const batch = async (no, vendor, qty) => (await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date, vendor_id)
     VALUES ($1, $2, $3, 5000, CURRENT_DATE + 400, $4) RETURNING id`, [P.otc, no, qty, vendor]))[0].id;
  const B = { a: await batch('S9-A1', V.a, 500), b: await batch('S9-B1', V.b, 50) };
  const address = async (k, pin, state, city) => (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, $2, '9000000999', '9 Test Road', $4, $5, $3, TRUE) RETURNING id`, [ids[k], people[k].full_name, pin, city, state]))[0].id;
  const addr = { trader: await address('trader', PIN, 'Karnataka', 'Bengaluru'), trader2: await address('trader2', PIN, 'Karnataka', 'Bengaluru'),
    buyer: await address('buyer', PIN, 'Karnataka', 'Bengaluru') };
  return { ids, t, P, V, B, addr };
}

// A ready-to-pack order (credit terms for traders, paid for consumers)
let pay = 0;
export async function order({ t, P, addr }, who = 'trader', qty = 2) {
  const body = { address_id: addr[who], pincode: PIN, items: [{ product_id: P.otc, quantity: qty }], ...(who === 'buyer' ? {} : { payment_terms: 'net_30' }) };
  const r = await call('POST', '/orders', { token: t[who], body });
  const o = r.json.data?.order;
  if (!o) throw new Error(`order failed: ${JSON.stringify(r.json)}`);
  if (who === 'buyer') {
    pay++;
    await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at) VALUES ($1, $2, $3, 'captured', $4, NOW())`,
      [o.id, `order_S9_${pay}_${Date.now()}`, `pay_S9_${pay}_${Date.now()}`, o.total_paise]);
    await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]);
  }
  const s = (await q(`SELECT id, invoice_number FROM order_shipments WHERE order_id = $1`, [o.id]))[0];
  return { order: o, shipmentId: s.id, invoiceNumber: s.invoice_number };
}

export async function waitFor(sql, params, ok = (rows) => rows.length > 0, ms = 20000) {
  const end = Date.now() + ms;
  let rows = [];
  while (Date.now() < end) {
    rows = await q(sql, params);
    if (ok(rows)) return rows;
    await new Promise((r) => setTimeout(r, 300));
  }
  return rows;
}
