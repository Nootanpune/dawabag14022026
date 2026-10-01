// Sprint 7 test data: mobiles 90000007xx, SKU prefix S7-, vendors 'S7 %', pincode 499971
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499971';
export const people = {
  admin: person('9000000701', 'S7 Admin'), admin2: person('9000000702', 'S7 Admin Two'),
  packer: person('9000000703', 'S7 Storekeeper'), buyer: person('9000000704', 'S7 Buyer'),
};

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S7-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S7 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const batchIds = (await q('SELECT id FROM inventory_batches WHERE product_id = ANY($1)', [productIds])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run('DELETE FROM stock_adjustments WHERE batch_id = ANY($1)', [batchIds]);
  await run('DELETE FROM stock_count_lines WHERE batch_id = ANY($1)', [batchIds]);
  await run('DELETE FROM stock_counts WHERE counted_by = ANY($1)', [ids]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE inventory_batches SET grn_line_id = NULL WHERE id = ANY($1)', [batchIds]);
  await run('DELETE FROM grn_lines WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM goods_receipts WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE vendor_id = ANY($1))', [vendorIds]);
  await run('DELETE FROM purchase_orders WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await run(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await run('UPDATE vendors SET approved_by = NULL WHERE id = ANY($1)', [vendorIds]);
  await run('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE id = ANY($1)', [batchIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = ANY($1)`, [[ids.admin, ids.admin2]]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const decl = { net_quantity: '10 tablets', manufacturer_name: 'S7 Pharma', manufacturer_address: 'Plot 7, MIDC, Nashik 422007' };
  const mk = async (sku) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name: `S7 ${sku}`, sku, category: 'Smoke', drug_schedule: 'OTC',
      gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 50, ...decl } });
    check(`product ${sku} created`, r.status === 201, r.json);
    return r.json.data?.id;
  };
  const P = { a: await mk('S7-A'), b: await mk('S7-B'), c: await mk('S7-C') };
  const addr = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S7 Buyer', '9000000799', '7 Test Lane', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
  return { ids, t, P, addr };
}
