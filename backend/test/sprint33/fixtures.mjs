// Sprint 33 smoke test data: SKUs S33-, generic names 'Zorvaquin' / 'Zorvaquin Oti', mobiles 90000033xx,
// PINs 499933 (Dawabag delivers in 24 h, courier 3 days, cold chain), 499934 (not served), 499935 (no cold chain).
// Every name is made up. Removed by cleanup().
import { call, login, q, signUp } from '../sprint5/lib.mjs';

export const PIN = '499933';
export const PIN_OFF = '499934';
export const PIN_NO_COLD = '499935';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
export const people = {
  admin: person('9000003301', 'S33 Admin'), pharmacist: person('9000003302', 'S33 Pharmacist'),
  pharmacistNoReg: person('9000003303', 'S33 Unregistered Pharmacist'), packer: person('9000003304', 'S33 Packer'),
  buyer: person('9000003305', 'S33 Buyer'), other: person('9000003306', 'S33 Other Buyer'),
};

// [key, sku, name, generic, schedule, price (paise), stock, pack, extra]
const PRODUCTS = [
  ['current', 'S33-CUR', 'S33 Zorvex 650 Tablet', 'Zorvaquin', 'OTC', 3000, 40, '10 tablets'],
  ['perTab', 'S33-PERTAB', 'S33 Zorvaquin 650 mg Tablet', 'Zorvaquin', 'OTC', 3000, 40, '15 tablets'],        // 200 / tablet
  ['cheapOut', 'S33-CHEAPOUT', 'S33 Calzor 650 Tablet', 'Zorvaquin', 'OTC', 1000, 0, '10 tablets'],          // 100 / tablet, out of stock
  ['dear', 'S33-DEAR', 'S33 Dearzor 650 Tablet', 'Zorvaquin', 'OTC', 4000, 10, '10 tablets'],               // 400 / tablet
  ['strength', 'S33-500', 'S33 Zorvaquin 500 mg Tablet', 'Zorvaquin', 'OTC', 500, 10, '10 tablets'],         // other strength
  ['release', 'S33-SR', 'S33 Zorvaquin 650 mg SR Tablet', 'Zorvaquin', 'OTC', 500, 10, '10 tablets'],        // other release
  ['syrup', 'S33-SYR', 'S33 Zorvaquin 650 Syrup', 'Zorvaquin', 'OTC', 500, 10, '100 ml'],                    // other form
  ['inactive', 'S33-OFF', 'S33 Zorlast 650 Tablet', 'Zorvaquin', 'OTC', 500, 10, '10 tablets', { active: false }],
  ['rx', 'S33-RX', 'S33 Zorvacil 250 Capsule', 'Zorvacillin', 'Schedule H', 6000, 20, '10 capsules'],
  ['cold', 'S33-COLD', 'S33 Zorinsulin 100 IU Injection', 'Zorinsulin', 'Schedule H', 45000, 5, '1 vial', { cold: true }],
  ['eye', 'S33-EYE', 'S33 Zorvaquin Oti 0.3% Eye Drops', 'Zorvaquin Oti', 'OTC', 900, 5, '5 ml'],
  ['ear', 'S33-EAR', 'S33 Zorvaquin Oti 0.3% Ear Drops', 'Zorvaquin Oti', 'OTC', 500, 5, '5 ml'],
];
export const P = {};
export const ids = {};
export const t = {};

export async function cleanup() {
  const userIds = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S33-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [userIds])).map((r) => r.id);
  await q(`DELETE FROM info_pages WHERE published_by = ANY($1) OR (version > 1 AND title LIKE 'S33 %')`, [userIds]);
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE user_id = ANY($1))', [userIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [userIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR action LIKE 'info_page_%' AND new_value->>'version' <> '1'`, [productIds]);
  for (const tbl of ['cart_items', 'carts', 'notifications', 'orders', 'audit_logs', 'consent_records', 'medicine_reminders', 'health_profiles']) {
    await q(`DELETE FROM ${tbl} WHERE user_id = ANY($1)`, [userIds]);
  }
  await q('DELETE FROM patients WHERE owner_user_id = ANY($1)', [userIds]);
  await q('DELETE FROM addresses WHERE user_id = ANY($1)', [userIds]);
  await q('DELETE FROM user_profiles WHERE user_id = ANY($1)', [userIds]);
  await q('DELETE FROM product_info_versions WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = ANY($1)', [[PIN, PIN_OFF, PIN_NO_COLD]]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days, cold_chain_available, is_serviceable)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.01, 73.79, 24, 3, TRUE, TRUE),
                  ($2, 'Nowhere', 'Maharashtra', 20.5, 74.0, NULL, 5, FALSE, FALSE),
                  ($3, 'Sinnar', 'Maharashtra', 19.85, 74.0, NULL, 4, FALSE, TRUE)`, [PIN, PIN_OFF, PIN_NO_COLD]);
  for (const [key, sku, name, generic, schedule, price, stock, pack, extra = {}] of PRODUCTS) {
    const [{ id }] = await q(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise,
                             max_qty_per_order, net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active, cold_chain)
       VALUES ($1, $2, $3, 'S33 Smoke', $4, 12, '30049099', $5, $5, 10, $6, 'S33 Remedies Pvt Ltd', 'Plot 33, MIDC Ambad, Nashik', 'India', $7, $8)
       RETURNING id`, [name, generic, sku, schedule, price, pack, extra.active !== false, !!extra.cold]);
    P[key] = id;
    if (stock) {
      // two batches: the earlier one (14 months) is what FEFO would supply; one with 20 days left is never sold
      await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
               VALUES ($1, 'S33-B1', $2, 300, (date_trunc('month', CURRENT_DATE) + INTERVAL '14 months' + INTERVAL '9 days')::date),
                      ($1, 'S33-B0', 5, 300, CURRENT_DATE + 20)`, [id, stock]);
    }
  }
  for (const [k, p] of Object.entries(people)) ids[k] = (await signUp(p)).user_id;
  await q(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [ids.admin]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = 'S33-MSPC-0001' WHERE id = $1`, [ids.pharmacist]);
  await q(`UPDATE users SET role = 'pharmacist_rx', pharmacist_reg_no = NULL WHERE id = $1`, [ids.pharmacistNoReg]);
  await q(`UPDATE users SET role = 'pharmacist_pack' WHERE id = $1`, [ids.packer]);
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  t.address = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
     VALUES ($1, 'S33 Buyer', '9000003399', '33 Lane', 'Nashik', 'Maharashtra', $2, TRUE) RETURNING id`, [ids.buyer, PIN]))[0].id;
}

/** A delivered order (status set as the delivery flow would), optionally for a family member. */
export async function deliveredOrder(items, patientId) {
  const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: t.address, pincode: PIN, items,
    ...(patientId ? { patient_id: patientId } : {}) } });
  const id = r.json.data?.order?.id;
  if (id) await q(`UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = $1`, [id]);
  return { id, response: r };
}
