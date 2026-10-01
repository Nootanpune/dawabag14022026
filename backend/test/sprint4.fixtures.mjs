// Test data and cleanup for sprint4.smoke.mjs
const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });

export const PIN = '499941';
export const people = {
  admin: person('9000000401', 'S4 Admin'),
  pharmacist: person('9000000402', 'S4 Pharmacist'),
  packer: person('9000000403', 'S4 Packer'),
  buyer: person('9000000404', 'S4 Buyer'),
  buyer2: person('9000000405', 'S4 Buyer Two'),
};

export async function cleanup(q) {
  const mobiles = Object.values(people).map((p) => p.mobile);
  // An erased test user has lost its mobile; find it by its (retained) address
  const ids = (await q(
    `SELECT id FROM users WHERE mobile = ANY($1)
     UNION SELECT user_id FROM addresses WHERE pincode = $2`, [mobiles, PIN])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S4-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const rxIds = (await q('SELECT id FROM prescriptions WHERE user_id = ANY($1)', [ids])).map((r) => r.id);

  await q('DELETE FROM h1_register WHERE order_id = ANY($1) OR product_id = ANY($2)', [orderIds, productIds]);
  await q('UPDATE order_items SET prescription_id = NULL WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM prescription_items WHERE prescription_id = ANY($1)', [rxIds]);
  await q('DELETE FROM prescriptions WHERE id = ANY($1)', [rxIds]);
  await q('DELETE FROM grievances WHERE user_id = ANY($1)', [ids]);    // messages cascade
  await q('DELETE FROM batch_recalls WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM data_requests WHERE user_id = ANY($1)', [ids]);
  await q('DELETE FROM settlement_adjustments WHERE return_id IN (SELECT id FROM return_requests WHERE order_id = ANY($1))', [orderIds]);
  await q('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM return_requests WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await q('UPDATE app_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
  await q('UPDATE orders SET pharmacist_pack_id = NULL WHERE pharmacist_pack_id = ANY($1)', [ids]);
  for (const t of ['cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}
