// Sprint 35 test data: mobiles 90000035xx, SKUs S35-, vendors 'S35 …', PIN 499358.
// Every name and number is made up. Removed by cleanup().
import { call, login, q, redis, signUp } from '../sprint5/lib.mjs';
import { licencePartner } from '../support/partnerLicences.mjs';

export const PIN = '499358';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000003501', 'S35 Admin'), pharmacist: person('9000003502', 'S35 Pharmacist'),
  pharmacistNoReg: person('9000003503', 'S35 Unregistered Pharmacist'), packer: person('9000003504', 'S35 Packer'),
  buyer: person('9000003505', 'S35 Buyer'), trader: person('9000003506', 'S35 Retailer'),
  partner: person('9000003507', 'S35 Partner login'), partner2: person('9000003508', 'S35 Other Partner login'),
  resetter: person('9000003509', 'S35 Forgetful Buyer'),
};
export const P = {};
export const ids = {};
export const t = {};
export const V = {};
export const VP = {};
export const addr = {};

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S35-%'`)).map((r) => r.id);
  const vendorIds = (await q(`SELECT id FROM vendors WHERE name LIKE 'S35 %'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM h1_register WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM partner_order_items WHERE order_id = ANY($1) OR partner_id = ANY($2)', [orderIds, vendorIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE order_items SET prescription_id = NULL WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE user_id = ANY($1))', [userIds]);
  await run('DELETE FROM prescriptions WHERE user_id = ANY($1)', [userIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id = ANY($1))', [userIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await run('UPDATE orders SET pharmacist_pack_id = NULL, cancelled_by = NULL WHERE pharmacist_pack_id = ANY($1) OR cancelled_by = ANY($1)', [userIds]);
  await run(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  for (const tbl of ['wallet_transactions', 'cart_items', 'carts', 'notifications', 'orders', 'audit_logs', 'consent_records', 'addresses', 'user_profiles']) {
    await run(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await run('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendorIds, userIds]);
  await run('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await run('DELETE FROM partner_inventory WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM partner_products WHERE partner_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendor_pharmacists WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM party_licences WHERE vendor_id = ANY($1)', [vendorIds]);
  await run('DELETE FROM vendors WHERE id = ANY($1)', [vendorIds]);
  await run(`DELETE FROM invoice_series WHERE prefix LIKE 'S35%' OR series_key = ANY($1)`, [vendorIds.map((v) => `P:${v}`)]);
  await run('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await run('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await run('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
  for (const m of [...Object.values(people).map((p) => p.mobile), '9000003598']) await redis.del(`otp:${m}`, `otp_wrong:${m}`);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 12, 2)`, [PIN]);
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'MSPC-S35-1' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_rx' WHERE id = $1`, [ids.pharmacistNoReg]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  await q(`UPDATE users SET customer_type = 'b2b_retailer', kyc_status = 'approved', credit_limit_paise = 10000000 WHERE id = $1`, [ids.trader]);
  await q(`UPDATE users SET role = 'partner' WHERE id = ANY($1)`, [[ids.partner, ids.partner2]]);
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);

  const decl = { net_quantity: '10 tablets', manufacturer_name: 'S35 Remedies Pvt Ltd', manufacturer_address: 'Plot 35, MIDC Satpur, Nashik 422007' };
  const mk = async (sku, extra = {}) => {
    const r = await call('POST', '/products', { token: t.admin, body: { name: `S35 ${sku}`, sku, category: 'Smoke', drug_schedule: 'OTC',
      gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, ptr_price_paise: 7500, max_qty_per_order: 5, ...decl, ...extra } });
    if (r.status !== 201) throw new Error(`product ${sku}: ${JSON.stringify(r.json)}`);
    return r.json.data.id;
  };
  P.own = await mk('S35-OWN');
  P.rx = await mk('S35-RX', { drug_schedule: 'Schedule H' });
  P.part = await mk('S35-PART');
  for (const p of [P.own, P.rx]) {
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'S35-B1', 200, 5000, CURRENT_DATE + 400)`, [p]);
  }
  // Two partners at the buyer's PIN; only the first stocks S35-PART
  const vendor = async (name, prefix, login) => {
    const id = (await q(`INSERT INTO vendors (name, drug_license_no, gst_number, pincode, city, state, latitude, longitude, vendor_type,
         approval_status, is_active, invoice_prefix, drug_license_expiry)
       VALUES ($1, $2, '27ABCDE3535F1Z5', $3, 'Nashik', 'Maharashtra', 20.0110, 73.7900, 'marketplace_partner',
         'approved', TRUE, $4, CURRENT_DATE + 700) RETURNING id`, [name, `DL-${prefix}`, PIN, prefix]))[0].id;
    await licencePartner(q, id);
    await q(`INSERT INTO vendor_users (vendor_id, user_id) VALUES ($1, $2)`, [id, login]);
    return id;
  };
  V.a = await vendor('S35 Lake Pharmacy', 'S35A', ids.partner);
  V.b = await vendor('S35 Hill Pharmacy', 'S35B', ids.partner2);
  VP.a = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no) VALUES ($1, 'S35 Asha Pharmacist', 'MSPC-S35-P1') RETURNING id`, [V.a]))[0].id;
  VP.aOld = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no, is_active) VALUES ($1, 'S35 Former Pharmacist', 'MSPC-S35-P0', FALSE) RETURNING id`, [V.a]))[0].id;
  VP.b = (await q(`INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no) VALUES ($1, 'S35 Hill Pharmacist', 'MSPC-S35-P2') RETURNING id`, [V.b]))[0].id;
  const PP = (await q(`INSERT INTO partner_products (partner_id, product_id, medicine_name, approval_status, listing_status, catalogue_price_accepted)
     VALUES ($1, $2, 'S35 S35-PART', 'approved', 'live', TRUE) RETURNING id`, [V.a, P.part]))[0].id;
  await q(`INSERT INTO partner_inventory (partner_id, partner_product_id, batch_number, qty_available, expiry_date)
           VALUES ($1, $2, 'S35-PB1', 100, CURRENT_DATE + 400)`, [V.a, PP]);

  const address = async (uid, name) => (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, $2, '9000003599', '35 Lake Road', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [uid, name, PIN]))[0].id;
  addr.buyer = await address(ids.buyer, 'S35 Buyer');
  addr.trader = await address(ids.trader, 'S35 Retailer');
}

let pay = 0;
/** Places an order and marks it paid the way payment capture does: 'packing', or 'rx_pending' with a prescription line. */
export async function paidOrder(items, status = 'packing') {
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items } });
  const o = r.json.data?.order;
  if (!o) throw new Error(`order not placed: ${JSON.stringify(r.json)}`);
  pay++;
  await q(`INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, status, amount_paise, paid_at, method)
           VALUES ($1, $2, $3, 'captured', $4, NOW(), 'upi')`, [o.id, `order_S35_${pay}_${Date.now()}`, `pay_S35_${pay}_${Date.now()}`, o.total_paise]);
  await q(`UPDATE orders SET status = $2 WHERE id = $1`, [o.id, status]);
  const shipments = await q(`SELECT id, seller_type FROM order_shipments WHERE order_id = $1`, [o.id]);
  return { order: o, own: shipments.find((s) => s.seller_type === 'dawabag')?.id, partner: shipments.find((s) => s.seller_type === 'partner')?.id };
}
