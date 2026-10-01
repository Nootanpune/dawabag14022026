// Sprint 11 test data: mobiles 90000011xx, SKU prefix S11-, pincode 499911
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';

const consent = { accept_privacy_notice: true, age_confirmed: true };
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!', ...consent });
export const PIN = '499911';
export const people = { admin: person('9000001101', 'S11 Admin'), buyer: person('9000001102', 'S11 Buyer'), other: person('9000001103', 'S11 Other') };

export async function cleanup() {
  const ids = (await q(`SELECT id FROM users WHERE mobile = ANY($1)`, [Object.values(people).map((p) => p.mobile)])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S11-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const run = (sql, p) => q(sql, p);
  await run(`DELETE FROM payment_webhook_events WHERE order_ref IN (SELECT gateway_order_id FROM payments WHERE order_id = ANY($1))
             OR order_ref IN (SELECT gateway_order_id FROM payment_mandates WHERE user_id = ANY($2)) OR event_id LIKE 'evt_s11_%'`, [orderIds, ids]);
  await run('UPDATE refill_subscriptions SET mandate_id = NULL, last_order_id = NULL WHERE user_id = ANY($1)', [ids]);
  await run('UPDATE orders SET refill_subscription_id = NULL WHERE user_id = ANY($1)', [ids]);
  await run('DELETE FROM refill_items WHERE subscription_id IN (SELECT id FROM refill_subscriptions WHERE user_id = ANY($1))', [ids]).catch(() => {});
  await run('DELETE FROM refill_subscriptions WHERE user_id = ANY($1)', [ids]);
  await run('DELETE FROM payment_mandates WHERE user_id = ANY($1)', [ids]);
  await run('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ANY($1))', [orderIds]);
  await run('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await run('DELETE FROM order_shipments WHERE order_id = ANY($1)', [orderIds]);
  await run('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  await run('UPDATE orders SET cancelled_by = NULL WHERE cancelled_by = ANY($1)', [ids]);
  await run('UPDATE job_runs SET triggered_by = NULL WHERE triggered_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'user_devices', 'wallet_transactions', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
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
  const t = {};
  for (const [k, p] of Object.entries(people)) t[k] = await login(p);
  const r = await call('POST', '/products', { token: t.admin, body: { name: 'S11 Cetirizine 10', sku: 'S11-OTC', category: 'Smoke', drug_schedule: 'OTC',
    gst_rate: 12, hsn_code: '30049099', mrp_paise: 10000, offer_price_paise: 9000, max_qty_per_order: 50,
    net_quantity: '10 tablets', manufacturer_name: 'S11 Pharma', manufacturer_address: 'Plot 11, MIDC Satpur, Nashik 422007' } });
  check('product created', r.status === 201, r.json);
  const P = { otc: r.json.data?.id };
  await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
           VALUES ($1, 'S11-B1', 500, 5000, CURRENT_DATE + 400)`, [P.otc]);
  const addr = {};
  for (const k of ['buyer', 'other']) {
    addr[k] = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
       VALUES ($1, $2, '9000001199', '11 Test Lane', 'Nashik', 'Maharashtra', $3, TRUE) RETURNING id`, [ids[k], people[k].full_name, PIN]))[0].id;
  }
  return { ids, t, P, addr };
}

// An order waiting for payment
export async function pendingOrder({ t, P, addr }, who = 'buyer', qty = 1) {
  const r = await call('POST', '/orders', { token: t[who], body: { address_id: addr[who], pincode: PIN, items: [{ product_id: P.otc, quantity: qty }] } });
  if (!r.json.data?.order) throw new Error(`order failed: ${JSON.stringify(r.json)}`);
  return r.json.data.order;
}
export const status = async (orderId) => (await q(`SELECT status FROM orders WHERE id = $1`, [orderId]))[0].status;
export const payment = async (orderId) => (await q(`SELECT status, gateway_payment_id, refund_amount_paise FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]))[0];
