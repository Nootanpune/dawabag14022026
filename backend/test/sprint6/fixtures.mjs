// Sprint 6 test data: mobiles 90000006xx, SKU prefix S6-, vendor 'S6 Partner', pincode 499961
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499961';
export const people = {
  admin: person('9000000601', 'S6 Admin'), pharmacist: person('9000000602', 'S6 Pharmacist'),
  packer: person('9000000603', 'S6 Packer'), delivery: person('9000000604', 'S6 Rider'),
  buyer: person('9000000605', 'S6 Buyer'), buyer2: person('9000000606', 'S6 Buyer Two'),
  trader: person('9000000607', 'S6 Retailer'), partner: person('9000000608', 'S6 Partner login'),
};

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1) UNION SELECT user_id FROM addresses WHERE pincode = $2`,
    [Object.values(people).map((p) => p.mobile), PIN])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S6-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S6 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const rxIds = (await q('SELECT id FROM prescriptions WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run(`DELETE FROM security_incidents WHERE title LIKE 'S6 %'`);
  await run('DELETE FROM coupon_redemptions WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM h1_register WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE orders SET requested_prescription_id = NULL WHERE id = ANY($1)', [orderIds]);
  await run('UPDATE order_items SET prescription_id = NULL WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM prescription_items WHERE prescription_id = ANY($1)', [rxIds]);
  await run('DELETE FROM prescriptions WHERE id = ANY($1)', [rxIds]);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE products SET content_reviewed_by = NULL WHERE content_reviewed_by = ANY($1)', [ids]);
  await run('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL, credit_settled_by = NULL WHERE pharmacist_pack_id = ANY($1) OR cancelled_by = ANY($1) OR credit_settled_by = ANY($1)', [ids]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['wallet_transactions', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await run(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await run(`DELETE FROM coupons WHERE code LIKE 'S6%'`);
  await run('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, ids]);
  await run('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days, cold_chain_available)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2, TRUE)`, [PIN]);
  const ids = {};
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  const role = (k, r, extra = '') => q(`UPDATE users SET role = '${r}'${extra} WHERE id = $1`, [ids[k]]);
  await role('admin', 'super_admin'); await role('pharmacist', 'pharmacist_rx', `, pharmacist_reg_no = 'MSPC-S6-1'`);
  await role('packer', 'pharmacist_pack'); await role('delivery', 'delivery');
  await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', credit_limit_paise = 10000000 WHERE id = $1`, [ids.trader]);
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);

  const decl = { net_quantity: '10 tablets', manufacturer_name: 'S6 Pharma', manufacturer_address: 'Plot 6, MIDC Ambad, Nashik 422010' };
  const mk = async (sku, extra = {}) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name: `S6 ${sku}`, sku, category: 'Smoke', drug_schedule: 'OTC',
      gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 50, ...decl, ...extra } });
    check(`product ${sku} created`, r.status === 201, r.json);
    return r.json.data?.id;
  };
  const P = { otc: await mk('S6-OTC'), rx: await mk('S6-RXH', { drug_schedule: 'Schedule H' }), cold: await mk('S6-COLD', { cold_chain: true }) };
  for (const p of Object.values(P)) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'S6-B1', 500, 5000, CURRENT_DATE + 400)`, [p]);
  }
  const V = (await q(`INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, vendor_type, approval_status, is_active, invoice_prefix)
     VALUES ('S6 Partner', 'DL-S6', '27ABCDE6666F1Z5', $1, 'Nashik', 'Maharashtra', 'marketplace_partner', 'approved', TRUE, 'S6P') RETURNING id`, [PIN]))[0].id;
  await licencePartner(q, V);   // Sprint 32: sells under checked retail + wholesale licences
  await q(`UPDATE users SET role = 'partner' WHERE id = $1`, [ids.partner]);
  await q(`INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2)`, [V, ids.partner]);
  t.partner = await login(people.partner);

  const address = async (k) => (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, $2, '9000000699', '6 Test Lane', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [ids[k], people[k].full_name, PIN]))[0].id;
  const addr = { buyer: await address('buyer'), buyer2: await address('buyer2'), trader: await address('trader') };
  return { ids, t, P, V, addr };
}

let pay = 0;
export async function markPaid(orderId, amount) {
  pay++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at)
           VALUES ($1, $2, $3, 'captured', $4, NOW())`, [orderId, `order_S6_${pay}_${Date.now()}`, `pay_S6_${pay}_${Date.now()}`, amount]);
  await q(`UPDATE orders SET status = 'packing' WHERE id = $1`, [orderId]);
}
