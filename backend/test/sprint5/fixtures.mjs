// Sprint 5 test data: mobiles 90000005xx, SKU prefix S5-, vendor 'S5 Partner', pincode 499951
import { call, check, login, q, signUp } from './lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499951';
export const people = {
  admin: person('9000000501', 'S5 Admin'),
  pharmacist: person('9000000502', 'S5 Pharmacist'),
  packer: person('9000000503', 'S5 Packer'),
  buyer: person('9000000504', 'S5 Buyer'),
  doctor: person('9000000505', 'S5 Doctor'),
  trader: person('9000000506', 'S5 Retailer'),
  partner: person('9000000507', 'S5 Partner login'),
};

export async function cleanup() {
  const mobiles = Object.values(people).map((p) => p.mobile);
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1) UNION SELECT user_id FROM addresses WHERE pincode = $2`, [mobiles, PIN])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S5-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S5 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const del = (sql, p) => q(sql, p);
  await del('DELETE FROM settlement_adjustments WHERE partner_id = ANY($1)', [vendorIds]);
  await del('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await del('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await del('DELETE FROM return_requests WHERE order_id = ANY($1)', [orderIds]);
  await del('DELETE FROM adverse_event_reports WHERE user_id = ANY($1) OR product_id = ANY($2)', [ids, productIds]);
  await del('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await del('DELETE FROM settlement_batches WHERE partner_id = ANY($1)', [vendorIds]);
  await del('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await del('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await del('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await del(`DELETE FROM business_licences WHERE licence_number LIKE 'S5-%'`);
  await del(`DELETE FROM policy_documents WHERE title LIKE 'S5 %'`);
  await del('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await del('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  await del('UPDATE products SET content_reviewed_by = NULL WHERE content_reviewed_by = ANY($1)', [ids]);
  await del('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL WHERE pharmacist_pack_id = ANY($1) OR cancelled_by = ANY($1)', [ids]);
  await del('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['wallet_transactions', 'cart_items', 'carts', 'notifications', 'data_requests', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await del(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await del('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, ids]);
  await del('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await del('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await del('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
  await del('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await del(`DELETE FROM invoice_series WHERE prefix LIKE 'S5P%'`);
  await del('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await del('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await del(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await del('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await del('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

// Users, products, a partner and addresses; returns tokens and ids
export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S5-1' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET customer_type = 'doc_hospital', kyc_status = 'approved' WHERE id = $1`, [ids.doctor]);
  await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', credit_limit_paise = 10000000 WHERE id = $1`, [ids.trader]);
  await q(`UPDATE user_profiles SET wallet_balance_paise = 5000 WHERE user_id = $1`, [ids.buyer]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);

  const decl = { net_quantity: '10 tablets', manufacturer_name: 'S5 Pharma Ltd', manufacturer_address: 'Plot 5, MIDC Satpur, Nashik 422007' };
  const mk = async (sku, extra = {}) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name: `S5 ${sku}`, sku, category: 'Smoke', drug_schedule: 'OTC',
      gst_rate: 12, hsn_code: '3004', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 50, ...decl, ...extra } });
    check(`product ${sku} created`, r.status === 201, r.json);
    return r.json.data?.id;
  };
  const P = { own: await mk('S5-OWN'), part: await mk('S5-PART'), copy: await mk('S5-COPY', { description: 'Relieves headache and mild fever.' }) };
  for (const p of [P.own, P.copy]) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'S5-B1', 200, 5000, CURRENT_DATE + 400)`, [p]);
  }
  // Partner at the buyer's pincode, stocking only S5-PART
  const V = (await q(`INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type,
       approval_status, is_active, invoice_prefix, drug_license_expiry)
     VALUES ('S5 Partner', 'DL-S5-20B', '27ABCDE1234F1Z5', $1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 'marketplace_partner',
       'approved', TRUE, 'S5P', CURRENT_DATE + 700) RETURNING id`, [PIN]))[0].id;
  await licencePartner(q, V);   // Sprint 32: sells under checked retail + wholesale licences
  const PP = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted)
     VALUES ($1, $2, 'S5 S5-PART', 'approved', 'live', TRUE) RETURNING id`, [V, P.part]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S5-PB1', 100, CURRENT_DATE + 400)`, [V, PP]);
  await q(`UPDATE users SET role = 'partner' WHERE id = $1`, [ids.partner]);
  await q(`INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2)`, [V, ids.partner]);
  t.partner = await login(people.partner);

  const address = async (uid, name) => (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, $2, '9000000599', '5 Test Lane', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [uid, name, PIN]))[0].id;
  const addr = { buyer: await address(ids.buyer, 'S5 Buyer'), doctor: await address(ids.doctor, 'S5 Doctor'), trader: await address(ids.trader, 'S5 Retailer') };
  return { ids, t, P, V, addr };
}
