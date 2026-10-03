// Sprint 36 smoke test data: mobiles 90000036xx, SKUs S36-, vendors 'S36 %', categories
// 'S36 …', HSN codes 369936xx (made up: not real tariff lines), PIN 499936. Every name,
// number and licence below is made up. Removed by cleanup().
import { call, login, q, redis, signUp } from '../sprint5/lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

export const PIN = '499936';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000003601', 'S36 Admin'),
  pharmacistA: person('9000003602', 'S36 Pharmacist Asha'),
  pharmacistB: person('9000003603', 'S36 Pharmacist Bhaskar'),
  ownerA: person('9000003604', 'S36 Partner A Owner'),
  staffA: person('9000003605', 'S36 Partner A Counter'),
  ownerB: person('9000003606', 'S36 Partner B Owner'),
  buyer: person('9000003607', 'S36 Buyer'),
};
export const HSN = { a: '36993601', b: '36993602', c: '36993603', sold: '36993604' };
export const ids = {};
export const t = {};
export const V = {};
export const P = {};

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S36-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S36 %'`)).map((r) => r.id);
  const catIds = (await q(`SELECT id FROM product_categories WHERE name ILIKE 'S36 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  const keyIds = (await q('SELECT id FROM partner_api_keys WHERE partner_id = ANY($1)', [vendorIds])).map((r) => r.id);
  for (const k of keyIds) for (const rk of await redis.keys(`stockfeed:rl:${k}:*`)) await redis.del(rk);
  await q(`DELETE FROM audit_logs WHERE new_value->>'vendor_id' = ANY($1::text[]) OR new_value->>'product_id' = ANY($2::text[])
             OR new_value->>'category_id' = ANY($3::text[]) OR (action LIKE 'hsn_code_%' AND (new_value->>'code' LIKE '369936%' OR old_value->>'code' LIKE '369936%'))`,
    [vendorIds, productIds, catIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM orders WHERE id = ANY($1)', [orderIds]);
  await q('DELETE FROM partner_product_requests WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_item_links WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_stock_imports WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_import_mappings WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM partner_api_keys WHERE partner_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM party_licences WHERE vendor_id = ANY($1)', [vendorIds]);
  await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  for (const tbl of ['cart_items', 'carts', 'notifications', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await q('DELETE FROM product_info_versions WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM catalogue_drafts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('UPDATE product_categories SET merged_into = NULL, merged_by = NULL WHERE id = ANY($1) OR merged_into = ANY($1)', [catIds]);
  await q('UPDATE product_categories SET created_by = NULL WHERE created_by = ANY($1)', [userIds]);
  await q('DELETE FROM product_categories WHERE id = ANY($1)', [catIds]);
  await q(`UPDATE hsn_codes SET merged_into = NULL, merged_by = NULL WHERE code LIKE '369936%' OR merged_into LIKE '369936%'`);
  await q(`DELETE FROM hsn_codes WHERE code LIKE '369936%'`);
  await q('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await q('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

const vendor = async (name, dl, prefix) => (await q(
  `INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type, approval_status, is_active,
                        invoice_prefix, drug_license_type, drug_license_expiry)
   VALUES ($1, $2, '27ABCDE3636F1Z5', $3, 'Pune', 'Maharashtra', 18.52, 73.85, 'marketplace_partner', 'approved', TRUE, $4, 'dl20b', CURRENT_DATE + 500)
   RETURNING id`, [name, dl, PIN, prefix]))[0].id;

/** Products the stock file names (matched by the import) and the one with medicine information. */
const PRODUCTS = [
  ['alpha', 'S36-ALPHA', 'S36 Alphamolix 500 mg Tablet', '10 tablets', 'OTC'],
  ['info', 'S36-INFO', 'S36 Infozorin 250 mg Tablet', '10 tablets', 'OTC'],
];

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Pune', 'Maharashtra', 18.52, 73.85, 12, 1)`, [PIN]);
  for (const [key, sku, name, net, schedule] of PRODUCTS) {
    P[key] = (await q(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, max_qty_per_order,
                             net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active)
       VALUES ($1, $1, $2, 'S36 Smoke', $3, 12, '30049099', 3000, 2600, 10, $4, 'S36 Remedies Pvt Ltd', 'Plot 36, MIDC Bhosari, Pune', 'India', TRUE)
       RETURNING id`, [name, sku, schedule, net]))[0].id;
  }
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S36-MSPC-0001' WHERE id = $1`, [ids.pharmacistA]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S36-MSPC-0002' WHERE id = $1`, [ids.pharmacistB]);
  await q(`UPDATE users SET role = 'partner' WHERE id = ANY($1)`, [[ids.ownerA, ids.staffA, ids.ownerB]]);
  V.A = await vendor('S36 Partner A', 'DL-S36-A', 'S36A');
  V.B = await vendor('S36 Partner B', 'DL-S36-B', 'S36B');
  for (const v of Object.values(V)) await licencePartner(q, v);
  // The first login linked to a partner becomes its owner (trigger, migration 31)
  await q('INSERT INTO vendor_users (vendor_id, user_id, created_at) VALUES ($1, $2, NOW() - INTERVAL \'1 minute\')', [V.A, ids.ownerA]);
  await q('INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2), ($3, $4)', [V.A, ids.staffA, V.B, ids.ownerB]);
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  t.address = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S36 Buyer', '9000003699', '36 Lane', 'Pune', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
}

/** A product row with the given category / HSN (state: live or draft). */
export async function product(sku, { category, hsn = '30049099', state = 'live' }) {
  return (await q(
    `INSERT INTO products (name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise, catalogue_state, is_active,
                           manufacturer_name, manufacturer_address, country_of_origin, net_quantity)
     VALUES ($1, $1, $2, CASE WHEN $4::text = 'draft' THEN NULL ELSE 'OTC' END, 12, $3, 1000, 1000, $4::text, $4::text = 'live',
             'S36 Remedies Pvt Ltd', 'Plot 36, MIDC Bhosari, Pune', 'India', '10 tablets') RETURNING id`,
    [sku, category, hsn, state]))[0].id;
}

/** One sold order line for a product (what makes its HSN code appear on an invoice). */
export async function soldLine(productId) {
  const [o] = await q(
    `INSERT INTO orders (order_number, user_id, address_id, subtotal_paise, total_paise, status)
     VALUES ('S36-' || floor(random() * 1e9)::text, $1, $2, 1000, 1000, 'delivered') RETURNING id`, [ids.buyer, t.address]);
  await q(`INSERT INTO order_items (order_id, product_id, product_name, sku, quantity, unit_price_paise, mrp_paise, gst_rate, line_total_paise)
           VALUES ($1, $2, 'S36 sold', 'S36-SOLD', 1, 1000, 1000, 12, 1000)`, [o.id, productId]);
}

export const categoryId = async (name) => (await q('SELECT id FROM product_categories WHERE name = $1', [name]))[0]?.id;
export { call };
