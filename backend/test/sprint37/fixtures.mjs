// Sprint 37 smoke test data: mobiles 90000037xx, SKUs S37-, vendors 'S37 …', PIN 499937.
// Every name, number, licence, item code and quantity below is made up. Removed by cleanup().
import { call, login, q, redis, signUp } from '../sprint5/lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

export const PIN = '499937';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000003701', 'S37 Admin'),
  ownerA: person('9000003702', 'S37 Partner A Owner'),
  staffA: person('9000003703', 'S37 Partner A Counter'),
  ownerB: person('9000003704', 'S37 Partner B Owner'),
  buyer: person('9000003705', 'S37 Buyer'),
};
export const ids = {};
export const t = {};
export const V = {};
export const P = {};
export const PP = {};
export const VP = {};
export const addr = {};

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S37-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S37 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  const keyIds = (await q('SELECT id FROM partner_api_keys WHERE partner_id = ANY($1)', [vendorIds])).map((r) => r.id);
  for (const k of keyIds) for (const rk of [...await redis.keys(`stockfeed:rl:${k}:*`), ...await redis.keys(`stockfeed:live:${k}:*`)]) await redis.del(rk);
  const run = (sql, p) => q(sql, p);
  await run(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[]) OR new_value->>'product_id' = ANY($2::text[])`, [vendorIds, productIds]);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM h1_register WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id = ANY($1))', [userIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [userIds]);
  await run('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL WHERE pharmacist_pack_id = ANY($1) OR cancelled_by = ANY($1)', [userIds]);
  for (const tbl of ['wallet_transactions', 'cart_items', 'carts', 'notifications', 'orders', 'audit_logs', 'consent_records', 'addresses', 'user_profiles']) {
    await run(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await run('DELETE FROM partner_feed_checks WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_stock_feeds WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_product_requests WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_item_links WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_stock_imports WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_import_mappings WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_api_keys WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendor_pharmacists WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM party_licences WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await run('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM invoice_series WHERE prefix LIKE 'S37%' OR series_key = ANY($1)`, [vendorIds.map((v) => `P:${v}`)]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

const vendor = async (name, prefix) => {
  const id = (await q(
    `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                          invoice_prefix, drug_license_type, drug_license_expiry)
     VALUES ($1, $2, '27ABCDE3737F1Z5', $3, 'Pune', 'Maharashtra', 18.52, 73.85, 'marketplace_partner', 'approved', TRUE, $4, 'dl20b', CURRENT_DATE + 500)
     RETURNING id`, [name, `DL-${prefix}`, PIN, prefix]))[0].id;
  await licencePartner(q, id);
  return id;
};

// key, SKU / partner item code, name, cold chain
const PRODUCTS = [
  ['alpha', 'S37-ALPHA', 'S37 Alphazol 500 mg Tablet', false],
  ['beta', 'S37-BETA', 'S37 Betavir 250 mg Tablet', false],
  ['cold', 'S37-COLD', 'S37 Coldulin 40 IU Injection', true],
  ['gamma', 'S37-GAMMA', 'S37 Gammacet 10 mg Tablet', false],
];

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Pune', 'Maharashtra', 18.52, 73.85, 12, 1)`, [PIN]);
  for (const [key, sku, name, cold] of PRODUCTS) {
    P[key] = (await q(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
                             net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active, cold_chain)
       VALUES ($1, $1, $2, 'S37 Smoke', 'OTC', 12, '30049099', 3000, 2600, 10, '10 tablets', 'S37 Remedies Pvt Ltd', 'Plot 37, MIDC Bhosari, Pune',
               'India', TRUE, $3) RETURNING id`, [name, sku, cold]))[0].id;
  }
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'partner' WHERE id = ANY($1)`, [[ids.ownerA, ids.staffA, ids.ownerB]]);
  V.A = await vendor('S37 Partner A', 'S37A');
  V.B = await vendor('S37 Partner B', 'S37B');
  // The first login linked to a partner is its owner (migration 31)
  await q(`INSERT INTO vendor_users (vendor_id, user_id, created_at) VALUES ($1, $2, NOW() - INTERVAL '1 minute')`, [V.A, ids.ownerA]);
  await q('INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2), ($3, $4)', [V.A, ids.staffA, V.B, ids.ownerB]);
  VP.A = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no) VALUES ($1, 'S37 Asha Pharmacist', 'MSPC-S37-P1') RETURNING id`, [V.A]))[0].id;
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  addr.buyer = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S37 Buyer', '9000003799', '37 Lane', 'Pune', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;

  // Partner A lists ALPHA, BETA and COLD (approved, live) with stock entered by hand earlier
  for (const key of ['alpha', 'beta', 'cold']) {
    PP[key] = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted, cold_chain)
       VALUES ($1, $2, $3, 'approved', 'live', TRUE, $4) RETURNING id`, [V.A, P[key], `S37 ${key}`, key === 'cold']))[0].id;
  }
  const inv = (key, batch, qty, cold = false) => q(
    `INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date, cold_chain_confirmed)
     VALUES ($1, $2, $3, $4, CURRENT_DATE + 600, $5)`, [V.A, PP[key], batch, qty, cold]);
  await inv('alpha', 'S37A1', 50);
  await inv('beta', 'S37B1', 20);
  await inv('cold', 'S37C1', 6, true);
  // Partner A's software item codes are linked to the Dawabag products (GAMMA linked but not listed)
  for (const key of ['alpha', 'beta', 'cold', 'gamma']) {
    await q(`INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source) VALUES ($1, $2, $3, $4, 'manual')`,
      [V.A, `code:S37-${key.toUpperCase()}`, P[key], `S37 ${key}`]);
  }
}

let pay = 0;
/** Places an order and marks it paid the way payment capture does ('packing'). */
export async function paidOrder(items) {
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items } });
  const o = r.json.data?.order;
  if (!o) throw new Error(`order not placed: ${JSON.stringify(r.json)}`);
  pay++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at, method)
           VALUES ($1, $2, $3, 'captured', $4, NOW(), 'upi')`, [o.id, `order_S37_${pay}_${Date.now()}`, `pay_S37_${pay}_${Date.now()}`, o.total_paise]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [o.id]);
  const [s] = await q(`SELECT id FROM order_shipments WHERE order_id = $1 AND seller_type = 'partner'`, [o.id]);
  const [poi] = await q(`SELECT partner_inv_id, allocated_qty FROM partner_order_items WHERE order_id = $1`, [o.id]);
  return { order: o, shipment: s?.id, inventoryId: poi?.partner_inv_id, qty: poi?.allocated_qty };
}
