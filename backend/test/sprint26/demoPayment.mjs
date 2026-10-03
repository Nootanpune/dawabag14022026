// Sprint 26 — the trial's demo payment: no money moves, the order goes through the
// same capture path as a Razorpay payment, everything is flagged demo, and it is
// impossible anywhere but APP_ENV=trial without Razorpay keys.
// Test data: SKUs S26-, mobile 900000260x, PIN 499926; removed by cleanup().
import { call, check, login, q, signUp } from '../sprint5/lib.mjs';
import { callAt, startApi } from './trialApi.mjs';

export const PIN = '499926';
const person = (mobile, name) => ({ customer_type: 'customer', full_name: name, mobile, password: 'Passw0rd!',
  accept_privacy_notice: true, age_confirmed: true });
const buyer = person('9000002601', 'S26 Buyer');
const other = person('9000002602', 'S26 Other');
const P = {};
const NO_KEYS = { RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined, RAZORPAY_WEBHOOK_SECRET: undefined, RAZORPAY_BASE_URL: undefined };

export async function cleanup() {
  const ids = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [[buyer.mobile, other.mobile]])).map((r) => r.id);
  const productIds = (await q(`SELECT id FROM products WHERE sku LIKE 'S26-%'`)).map((r) => r.id);
  const orderIds = (await q('SELECT id FROM orders WHERE user_id = ANY($1)', [ids])).map((r) => r.id);
  const shipmentIds = (await q('SELECT id FROM order_shipments WHERE order_id = ANY($1)', [orderIds])).map((r) => r.id);
  await q('DELETE FROM refunds WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM credit_notes WHERE order_id = ANY($1)', [orderIds]).catch(() => {});
  await q('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM prescriptions WHERE order_id = ANY($1) AND status = \'pending\'', [orderIds]);   // Sprint 39: uploads sent with orders
  await q('DELETE FROM stock_movements WHERE order_id = ANY($1)', [orderIds]).catch(() => {});
  await q('DELETE FROM order_items WHERE order_id = ANY($1)', [orderIds]);
  await q('DELETE FROM invoices WHERE order_id = ANY($1)', [orderIds]).catch(() => {});
  await q('DELETE FROM order_shipments WHERE id = ANY($1)', [shipmentIds]);
  await q('UPDATE audit_logs SET performed_by = NULL WHERE performed_by = ANY($1)', [ids]);
  for (const t of ['notification_deliveries', 'cart_items', 'carts', 'notifications', 'orders', 'addresses', 'consent_records', 'audit_logs', 'user_profiles']) {
    await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [ids]);
  }
  await q('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [productIds]);
  await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [productIds]);
  await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[])`, [productIds]);
  await q('DELETE FROM products WHERE id = ANY($1)', [productIds]);
  await q('DELETE FROM pincode_serviceability WHERE pincode = $1', [PIN]);
}

export async function setup() {
  await q(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
           VALUES ($1, 'Nashik', 'Maharashtra', 20.01, 73.79, 12, 1)`, [PIN]);
  for (const [key, sku, name, schedule, price] of [['otc', 'S26-OTC', 'S26 Paracetamol 500', 'OTC', 3000], ['rx', 'S26-RX', 'S26 Amoxicillin 500', 'Schedule H', 6000]]) {
    const [{ id }] = await q(
      `INSERT INTO products (name, generic_name, sku, category, drug_schedule, gst_rate, hsn_code, mrp_paise, offer_price_paise,
                             max_qty_per_order, net_quantity, manufacturer_name, manufacturer_address, country_of_origin, is_active)
       VALUES ($1, $1, $2, 'S26 Smoke', $3, 12, '30049099', $4, $4, 10, '10 tablets', 'S26 Pharma', 'Plot 26, MIDC Ambad, Nashik', 'India', TRUE)
       RETURNING id`, [name, sku, schedule, price]);
    P[key] = id;
    await q(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
             VALUES ($1, 'S26-B1', 50, 500, CURRENT_DATE + 400)`, [id]);
  }
  const t = {};
  for (const [k, p] of [['buyer', buyer], ['other', other]]) {
    const { user_id } = await signUp(p);
    t[`${k}Id`] = user_id;
    t[k] = await login(p);
  }
  t.address = (await q(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode)
     VALUES ($1, 'S26 Buyer', '9000002699', '26 Lane', 'Nashik', 'Maharashtra', $2) RETURNING id`, [t.buyerId, PIN]))[0].id;
  return t;
}

const placeOrder = async (t, productId) => (await call('POST', '/orders', { token: t.buyer,
  body: { address_id: t.address, pincode: PIN, items: [{ product_id: productId, quantity: 1 }] } })).json.data?.order;

/** On the usual API (development, Razorpay keys set): no demo at all. */
export async function runOutsideTrial(t) {
  console.log('\nOutside a trial: demo payment does not exist');
  let r = await call('GET', '/payments/options', { token: t.buyer });
  check('payment options: Razorpay when its keys are set', r.status === 200 && r.json.data?.mode === 'razorpay', r.json);
  const order = await placeOrder(t, P.otc);
  r = await call('POST', '/payments/demo', { token: t.buyer, body: { order_id: order?.id, method: 'upi' } });
  check('POST /payments/demo → 404 outside a trial', r.status === 404, r);
  r = await call('POST', '/consultations/00000000-0000-4000-8000-000000000000/pay/demo', { token: t.buyer, body: {} });
  check('POST /consultations/:id/pay/demo → 404 outside a trial', r.status === 404, r.status);
  const [pay] = await q(`SELECT COUNT(*)::int AS n FROM payments WHERE order_id = $1 AND gateway = 'demo'`, [order?.id]);
  check('… and nothing was recorded', pay.n === 0, pay);
  const [o] = await q('SELECT status FROM orders WHERE id = $1', [order?.id]);
  check('… the order still waits for payment', o.status === 'pending_payment', o);
}

/** The API refuses to start with DEMO_PAYMENTS anywhere but a trial (config/env.ts). */
export async function runRefusedConfigs() {
  console.log('\nDEMO_PAYMENTS is refused outside APP_ENV=trial');
  for (const APP_ENV of ['production', 'staging']) {
    const r = await startApi(4127, { APP_ENV, DEMO_PAYMENTS: 'true', ...NO_KEYS });
    check(`APP_ENV=${APP_ENV} with DEMO_PAYMENTS=true does not start`, r.exitCode !== null && r.exitCode !== 0 && /DEMO_PAYMENTS is allowed only with APP_ENV=trial/.test(r.log),
      typeof r.log === 'string' ? r.log.slice(-400) : 'it started');
    if (r.stop) await r.stop();
  }
}

/** A trial server without Razorpay keys: demo payment end to end. */
export async function runTrialDemo(t) {
  console.log('\nTrial without Razorpay keys: demo payment');
  const api = await startApi(4126, { APP_ENV: 'trial', ALLOW_MISSING_INTEGRATIONS: 'true', ...NO_KEYS });
  if (!api.base) { check('trial API starts', false, api.log); return; }
  try {
    const b = api.base;
    let r = await callAt(b, 'GET', '/payments/options', { token: t.buyer });
    check('payment options: demo, UPI/card/netbanking/wallet, no cash on delivery', r.status === 200 && r.json.data?.mode === 'demo'
      && r.json.data.methods?.join() === 'upi,card,netbanking,wallet' && r.json.data.cash_on_delivery === false, r.json);
    check('… with the demo checkout\'s banks and wallets (names only)', r.json.data?.providers?.netbanking?.join() === 'SBI,HDFC,ICICI,Axis,Kotak'
      && r.json.data.providers.wallet?.join() === 'Paytm,PhonePe,Amazon Pay,Mobikwik', r.json.data?.providers);
    const order = await placeOrder(t, P.otc);
    r = await callAt(b, 'POST', '/payments/create-order', { token: t.buyer, body: { order_id: order.id } });
    check('Razorpay checkout without keys → a plain sentence, not a raw error', r.status === 503 && /not available right now/.test(r.json.message || ''), r.json);

    r = await callAt(b, 'POST', '/payments/demo', { token: t.other, body: { order_id: order.id, method: 'upi' } });
    check("another buyer's order → 404", r.status === 404, r.status);
    r = await callAt(b, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: order.id, method: 'wallet', provider: 'Some Bank' } });
    check('a bank or wallet we do not list → 422', r.status === 422, r.status);
    r = await callAt(b, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: order.id, method: 'card', provider: '4111111111111111' } });
    check('anything named with a card → 422 (no card data, ever)', r.status === 422, r.status);
    r = await callAt(b, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: order.id, method: 'card', outcome: 'failure' } });
    check('declined demo payment → not paid', r.status === 200 && r.json.data?.paid === false && r.json.data?.demo === true, r.json);
    let [o] = await q('SELECT status FROM orders WHERE id = $1', [order.id]);
    check('… the order is payment_failed, as after a failed Razorpay payment', o.status === 'payment_failed', o);
    let pays = await q(`SELECT gateway, status, method, gateway_order_id FROM payments WHERE order_id = $1`, [order.id]);
    check('… a failed payment row flagged gateway=demo', pays.length === 1 && pays[0].gateway === 'demo' && pays[0].status === 'failed'
      && /^demo_order_/.test(pays[0].gateway_order_id), pays);

    r = await callAt(b, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: order.id, method: 'upi', outcome: 'success' } });
    check('approved demo payment → paid', r.status === 200 && r.json.data?.paid === true, r.json);
    [o] = await q('SELECT status FROM orders WHERE id = $1', [order.id]);
    check('… the OTC order moves to packing (the captured-payment path)', o.status === 'packing', o);
    pays = await q(`SELECT gateway, status, method, gateway_payment_id FROM payments WHERE order_id = $1 AND status = 'captured'`, [order.id]);
    check('… a captured payment flagged demo (demo_pay_ id, method upi)', pays.length === 1 && pays[0].gateway === 'demo'
      && /^demo_pay_/.test(pays[0].gateway_payment_id) && pays[0].method === 'upi', pays);
    const audits = await q(`SELECT action FROM audit_logs WHERE user_id = $1 AND (new_value->>'order_id') = $2 ORDER BY created_at`, [t.buyerId, order.id]);
    const acts = audits.map((a) => a.action);
    check('… audit: demo_payment_failed, payment_captured and demo_payment_captured (demo: true)',
      acts.includes('demo_payment_failed') && acts.includes('payment_captured') && acts.includes('demo_payment_captured'), acts);
    const [flag] = await q(`SELECT new_value->>'demo' AS demo FROM audit_logs WHERE action = 'demo_payment_captured' AND (new_value->>'order_id') = $1`, [order.id]);
    check('… the audit entry says demo', flag?.demo === 'true', flag);
    r = await callAt(b, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: order.id, method: 'upi' } });
    check('paying again → 409', r.status === 409, r.json);

    // Prescription order: paid the same way, then it waits for the pharmacist (C-08)
    const rxOrder = await placeOrder(t, P.rx);
    r = await callAt(b, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: rxOrder.id, method: 'netbanking', provider: 'HDFC' } });
    [o] = await q('SELECT status FROM orders WHERE id = $1', [rxOrder.id]);
    check('a prescription order paid by demo goes to rx_pending (pharmacist queue)', r.json.data?.paid === true && o.status === 'rx_pending', o);
    // Sprint 39: only authorised (simulated) until the pharmacist's check passes
    check('… the demo payment is only authorised (held), not captured', r.json.data?.payment_status === 'authorized', r.json.data);
    const [bank] = await q(`SELECT new_value->>'provider' AS provider FROM audit_logs WHERE action = 'demo_payment_authorised' AND (new_value->>'order_id') = $1`, [rxOrder.id]);
    check('… the chosen bank is in the demo audit entry only', bank?.provider === 'HDFC', bank);

    // Cancelling the paid OTC order: the demo refund is settled at once (no gateway, C-37)
    r = await callAt(b, 'POST', `/orders/${order.id}/cancel`, { token: t.buyer, body: { reason: 'S26 smoke' } });
    const refunds = await q(`SELECT method, status, gateway_refund_id, amount_paise FROM refunds WHERE order_id = $1`, [order.id]);
    check('cancelling a demo-paid order settles the refund without Razorpay', r.status === 200 && refunds.length >= 1
      && refunds.every((x) => x.method !== 'gateway' || (x.status === 'processed' && /^demo_refund_/.test(x.gateway_refund_id))), { status: r.status, refunds });
    const [demoRefund] = await q(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'demo_refund_settled' AND (new_value->>'order_id') = $1`, [order.id]);
    check('… recorded as a demo refund in the audit log', demoRefund.n >= 1, demoRefund);
  } finally { await api.stop(); }

  console.log('\nTrial with DEMO_PAYMENTS=false: no demo, a plain "not available"');
  const off = await startApi(4128, { APP_ENV: 'trial', ALLOW_MISSING_INTEGRATIONS: 'true', DEMO_PAYMENTS: 'false', ...NO_KEYS });
  if (!off.base) { check('trial API (demo off) starts', false, off.log); return; }
  try {
    let r = await callAt(off.base, 'GET', '/payments/options', { token: t.buyer });
    check('payment options: unavailable', r.json.data?.mode === 'unavailable' && r.json.data.methods?.length === 0, r.json);
    const order = await placeOrder(t, P.otc);
    r = await callAt(off.base, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: order.id, method: 'upi' } });
    check('POST /payments/demo → 404', r.status === 404, r.status);
  } finally { await off.stop(); }
}
