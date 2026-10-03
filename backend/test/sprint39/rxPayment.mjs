// Sprint 39 — prescription before payment, and authorise-then-capture for prescription
// orders (owner decision 2026-10-03; C-08, C-37): no payment without a prescription; the
// card / UPI is only authorised at checkout and captured when the pharmacist check has
// passed; refusal, cancellation or timeout releases it — the buyer is never charged.
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment, expireAuthorisation, razorpay, sendWebhook } from '../fakes/razorpay.mjs';
import { callAt, startApi } from '../sprint26/trialApi.mjs';
import { P, PIN, V, addr, ids, orderRow, payment, placeOrder, rxBody, rxOf, shipmentsOf, t } from './fixtures.mjs';

const pay = async (orderId, { status = 'authorized' } = {}) => {
  const c = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: orderId } });
  if (c.status !== 200) return { c };
  const p = checkoutPayment(c.json.data.razorpay_order_id, { status });
  const v = await call('POST', '/payments/verify', { token: t.buyer, body: p });
  return { c, p, v };
};
const verifyRx = (orderId, productId, qty) => rxOf(orderId).then((rx) =>
  call('POST', `/fulfilment/prescriptions/${rx}/verify`, { token: t.pharmacist, body: rxBody(productId, qty) }));
/** Notifications are written by the queue a moment later */
export async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if ((Array.isArray(v) ? v.length : v) || Date.now() > end) return v; await new Promise((r) => setTimeout(r, 250)); }
}
const noted = (userId, type, like = '%') => waitFor(() => q(
  `SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND (body ILIKE $3 OR title ILIKE $3)`, [userId, type, like]));
const refunds = async (orderId) => q(`SELECT method, amount_paise, status FROM refunds WHERE order_id = $1`, [orderId]);

export async function runRxBeforePayment() {
  console.log('\nPrescription before payment (C-08)');
  const body = { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.rx, quantity: 1 }] };
  let r = await call('POST', '/orders/preview', { token: t.buyer, body });
  check('checkout preview says a prescription is needed and the payment waits for the pharmacist', r.status === 200
    && r.json.data?.prescription_required === true && r.json.data?.capture === 'after_pharmacist_check', r.json.data);
  const count = async () => (await q(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1`, [ids.buyer]))[0].n;
  const before = await count();
  r = await call('POST', '/orders', { token: t.buyer, body });
  check('POST /orders with a prescription medicine and no prescription → 422 PRESCRIPTION_REQUIRED', r.status === 422
    && r.json.code === 'PRESCRIPTION_REQUIRED' && /prescription/i.test(r.json.message), r.json);
  check('… and nothing was placed', (await count()) === before);
  const otc = await placeOrder([{ product_id: P.otc, quantity: 1 }], { withRx: false });
  check('an order without prescription medicines needs none', otc.r.status === 201 && otc.order?.capture === 'now', otc.r.json);
  const c = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: otc.order.id } });
  check('… and is captured at once by Razorpay (automatic capture)', c.status === 200 && c.json.data?.capture === 'now'
    && razorpay.orders.get(c.json.data.razorpay_order_id)?.payment_capture === true, c.json);

  const { r: placed, order } = await placeOrder([{ product_id: P.rx, quantity: 1 }]);
  check('with an uploaded prescription the order is placed and the prescription attached', placed.status === 201
    && order?.prescription?.status === 'awaiting_pharmacist' && order.capture === 'after_pharmacist_check', placed.json);
  // A refill order is created by the server without one: the buyer must add it before paying
  await q(`UPDATE prescriptions SET order_id = NULL WHERE order_id = $1`, [order.id]);
  r = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: order.id } });
  check('payment refused for an order whose prescription is missing → 422 PRESCRIPTION_REQUIRED', r.status === 422 && r.json.code === 'PRESCRIPTION_REQUIRED', r.json);
  const rx = (await q(`SELECT id FROM prescriptions WHERE user_id = $1 AND order_id IS NULL ORDER BY created_at DESC LIMIT 1`, [ids.buyer]))[0].id;
  r = await call('POST', `/prescriptions/${rx}/use-for-order`, { token: t.buyer, body: { order_id: order.id } });
  r = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: order.id } });
  check('once the prescription is attached again, payment starts', r.status === 200 && r.json.data?.capture === 'after_pharmacist_check', r.json);
  await call('POST', `/orders/${order.id}/cancel`, { token: t.buyer, body: { reason: 'S39 test: not needed' } });
}

export async function runAuthoriseCapture() {
  console.log('\nAuthorise at checkout → pharmacist passes → capture (C-08, C-37)');
  const { order } = await placeOrder([{ product_id: P.rx, quantity: 2 }]);
  const { c, p, v } = await pay(order.id);
  const rzp = razorpay.orders.get(c.json.data.razorpay_order_id);
  check('Razorpay is asked for MANUAL capture with the 5-day window (manual_expiry_period 7200)', rzp?.payment?.capture === 'manual'
    && rzp.payment.capture_options?.manual_expiry_period === 7200 && rzp.payment_capture === undefined, rzp);
  check('the checkout answer says it is charged only after the check', /only be charged after our pharmacist/.test(c.json.data?.charge_note ?? ''), c.json.data);
  check('verify answers "authorized" (not captured)', v.status === 200 && v.json.data?.payment_status === 'authorized' && v.json.data.status === 'rx_pending', v.json);
  let pm = await payment(order.id);
  const holdHours = (Date.parse(pm.release_due_at) - Date.parse(pm.authorised_at)) / 3600e3;
  check('payment held: authorized, manual, release due 72 h after authorisation, before the gateway window', pm.status === 'authorized'
    && pm.capture_mode === 'manual' && Math.round(holdHours) === 72 && Date.parse(pm.gateway_expires_at) > Date.parse(pm.release_due_at), pm);
  check('the money is not taken at the gateway yet', razorpay.payments.get(p.razorpay_payment_id)?.status === 'authorized');
  check('the buyer is told the payment is only authorised', (await noted(ids.buyer, 'payment_authorised', '%only be charged after%')).length >= 1);
  const { own } = await shipmentsOf(order.id);
  // Even a shipment marked released cannot be packed while the money is only held
  await q(`UPDATE order_shipments SET pharmacist_check = 'released', pharmacist_checked_at = NOW(), pharmacist_name = 'S39 probe', pharmacist_reg_no = 'X' WHERE id = $1`, [own]);
  await q(`UPDATE order_items SET prescription_id = (SELECT id FROM prescriptions WHERE order_id = $1 LIMIT 1) WHERE order_id = $1`, [order.id]);
  await q(`UPDATE orders SET status = 'rx_verified' WHERE id = $1`, [order.id]);
  let r = await call('POST', `/fulfilment/shipments/${own}/pack`, { token: t.packer });
  check('packing refused while the payment is only authorised → 409 PAYMENT_NOT_CAPTURED', r.status === 409 && r.json.code === 'PAYMENT_NOT_CAPTURED', r.json);
  await q(`UPDATE order_items SET prescription_id = NULL WHERE order_id = $1`, [order.id]);
  await q(`UPDATE orders SET status = 'rx_pending' WHERE id = $1`, [order.id]);
  await q(`UPDATE order_shipments SET pharmacist_check = 'pending', pharmacist_checked_at = NULL, pharmacist_name = NULL, pharmacist_reg_no = NULL WHERE id = $1`, [own]);

  r = await verifyRx(order.id, P.rx, 2);
  check('the pharmacist verifies the prescription (the check) → the held payment is captured', r.status === 200
    && /captured after the pharmacist check/.test(r.json.data?.payment ?? ''), r.json);
  pm = await payment(order.id);
  check('… captured at Razorpay for the full amount and recorded with the time', razorpay.payments.get(p.razorpay_payment_id)?.status === 'captured'
    && pm.status === 'captured' && !!pm.captured_at, pm);
  const [aud] = await q(`SELECT new_value FROM audit_logs WHERE action = 'payment_captured' AND new_value->>'order_id' = $1`, [order.id]);
  check('… audited as captured after the pharmacist check', aud?.new_value?.after_pharmacist_check === true, aud);
  r = await call('POST', `/fulfilment/shipments/${own}/pack`, { token: t.packer });
  check('now it can be packed', r.status === 200, r.json);
  const entity = { ...razorpay.payments.get(p.razorpay_payment_id) };
  r = await sendWebhook('payment.captured', { payment: { entity } });
  check('Razorpay\'s payment.captured webhook afterwards changes nothing', r.status === 200 && /already recorded/.test(r.json.outcome), r.json);

  console.log('\nThe same through the payment.authorized webhook (confirmation from the app lost)');
  const o2 = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
  const c2 = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: o2.id } });
  const p2 = checkoutPayment(c2.json.data.razorpay_order_id, { status: 'authorized' });
  const ent2 = { ...razorpay.payments.get(p2.razorpay_payment_id) };
  const at = Math.floor(Date.now() / 1000);
  r = await sendWebhook('payment.authorized', { payment: { entity: ent2 } }, 'evt_s39_a', at);
  check('payment.authorized records the hold and the order goes to the pharmacist', r.status === 200 && /authorised → rx_pending/.test(r.json.outcome)
    && (await payment(o2.id)).status === 'authorized', r.json);
  r = await sendWebhook('payment.authorized', { payment: { entity: ent2 } }, 'evt_s39_b', at);
  check('the same event again is a duplicate (deduplicated by body)', r.status === 200 && r.json.duplicate === true, r.json);
  r = await sendWebhook('payment.failed', { payment: { entity: { id: 'pay_s39_late_fail', order_id: ent2.order_id, amount: ent2.amount } } });
  check('a late payment.failed never overrides the hold', (await payment(o2.id)).status === 'authorized', r.json);

  console.log('\nMixed cart (OTC + prescription medicine): one authorisation, captured after every prescription part is released');
  const mixed = (await placeOrder([{ product_id: P.otc, quantity: 1 }, { product_id: P.h1p, quantity: 1 }])).order;
  const pm3 = await pay(mixed.id);
  check('mixed order authorised as one payment', pm3.v.json.data?.payment_status === 'authorized', pm3.v.json);
  const sh = await shipmentsOf(mixed.id);
  r = await verifyRx(mixed.id, P.h1p, 1);
  check('prescription verified: Dawabag\'s part released, the partner\'s prescription part still waits → not captured', r.status === 200
    && /pharmacist check not yet passed/.test(r.json.data?.payment ?? '') && (await payment(mixed.id)).status === 'authorized', r.json);
  r = await call('POST', `/fulfilment/shipments/${sh.own}/pack`, { token: t.packer });
  check('Dawabag\'s OTC part cannot be packed before the capture', r.status === 409 && r.json.code === 'PAYMENT_NOT_CAPTURED', r.json);
  r = await call('POST', `/partner/shipments/${sh.partner}/check`, { token: t.partner, body: { decision: 'release', vendor_pharmacist_id: V.pharmacist } });
  check('the partner\'s pharmacist releases its part → the whole amount is captured', r.status === 200 && /captured/.test(r.json.data?.payment ?? '')
    && razorpay.payments.get(pm3.p.razorpay_payment_id)?.status === 'captured' && (await payment(mixed.id)).status === 'captured', r.json);
  r = await call('POST', `/fulfilment/shipments/${sh.own}/pack`, { token: t.packer });
  check('… then Dawabag\'s part is packed', r.status === 200, r.json);
}

export async function runRefusalVoid() {
  console.log('\nRefusal → the hold is released; the buyer is never charged (C-37)');
  const { order } = await placeOrder([{ product_id: P.h1p, quantity: 1 }]);
  const { p } = await pay(order.id);
  await verifyRx(order.id, P.h1p, 1);
  const { partner } = await shipmentsOf(order.id);
  let r = await call('POST', `/partner/shipments/${partner}/check`, { token: t.partner,
    body: { decision: 'reject', vendor_pharmacist_id: V.pharmacist, reason: 'S39 test: dose not appropriate for the patient' } });
  check('the partner\'s pharmacist refuses → order cancelled with nothing refunded (nothing was charged)', r.status === 200
    && r.json.data?.order_status === 'cancelled' && r.json.data.refund_paise === 0, r.json);
  const pm = await payment(order.id);
  check('… the payment is released (never captured) with the reason', pm.status === 'released' && !!pm.released_at && /pharmacist/.test(pm.release_reason ?? ''), pm);
  check('… nothing captured at Razorpay and no refund was needed', razorpay.payments.get(p.razorpay_payment_id)?.status === 'authorized'
    && !(await refunds(order.id)).some((f) => f.method === 'gateway'), await refunds(order.id));
  const [aud] = await q(`SELECT 1 FROM audit_logs WHERE action = 'payment_authorisation_released' AND new_value->>'order_id' = $1`, [order.id]);
  check('… the release is audited', !!aud);

  const o2 = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
  await pay(o2.id);
  const rx = await rxOf(o2.id);
  r = await call('POST', `/fulfilment/prescriptions/${rx}/reject`, { token: t.pharmacist, body: { reason: 'S39 test: prescription unreadable' } });
  check('a refused prescription keeps the order open for a new one; still only held', (await orderRow(o2.id)).status === 'rx_rejected'
    && (await payment(o2.id)).status === 'authorized', await orderRow(o2.id));
  r = await call('POST', `/orders/${o2.id}/cancel`, { token: t.buyer, body: { reason: 'S39 test: no new prescription' } });
  check('the buyer cancels → released, not charged', r.status === 200 && r.json.data?.released_paise > 0 && r.json.data.refund_paise === 0
    && (await payment(o2.id)).status === 'released', r.json);
  check('… and is told they have not been charged', (await noted(ids.buyer, 'order_cancelled', '%not been charged%')).length >= 1);
}

export async function runTimeoutAndExpiry() {
  console.log('\nNobody checked it in time: alert, then release before the gateway window ends');
  const late = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
  await pay(late.id);
  await q(`UPDATE payments SET authorised_at = NOW() - INTERVAL '49 hours', release_due_at = NOW() + INTERVAL '23 hours' WHERE order_id = $1`, [late.id]);
  const gone = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
  await pay(gone.id);
  await q(`UPDATE payments SET authorised_at = NOW() - INTERVAL '73 hours', release_due_at = NOW() - INTERVAL '1 hour' WHERE order_id = $1`, [gone.id]);
  let r = await call('POST', '/admin/jobs/payment_hold_watch/run', { token: t.admin });
  check('the payment-hold watch runs (super-admin)', r.status === 200, r.json);
  check('after 48 h staff are alerted once (admins and pharmacists)', !!(await q(`SELECT hold_alerted_at FROM payments WHERE order_id = $1`, [late.id]))[0].hold_alerted_at
    && (await noted(ids.pharmacist, 'payment_hold_expiring')).length >= 1);
  const o = await orderRow(gone.id);
  check('at 72 h the unchecked order is cancelled and the hold released — buyer told they were not charged',
    o.status === 'cancelled' && /not been charged/.test(o.cancellation_reason ?? '') && (await payment(gone.id)).status === 'released', { o, p: await payment(gone.id) });
  r = await call('POST', '/admin/jobs/payment_hold_watch/run', { token: t.admin });
  check('running again alerts nobody twice', (await q(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'payment_hold_expiring'`, [ids.pharmacist]))[0].n === 1);
  await call('POST', `/orders/${late.id}/cancel`, { token: t.buyer, body: { reason: 'S39 test' } });

  console.log('\nThe gateway gave the hold back before the capture: the order is cancelled, never charged');
  const exp = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
  const { p } = await pay(exp.id);
  expireAuthorisation(p.razorpay_payment_id);
  r = await verifyRx(exp.id, P.rx, 1);
  const eo = await orderRow(exp.id);
  check('capture fails at the gateway → order cancelled with a plain reason, payment released', /cancelled|ended/.test(r.json.data?.payment ?? '')
    && eo.status === 'cancelled' && /hold ended/.test(eo.cancellation_reason ?? '') && (await payment(exp.id)).status === 'released', { r: r.json, eo });
}

const NO_KEYS = { RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined, RAZORPAY_WEBHOOK_SECRET: undefined, RAZORPAY_BASE_URL: undefined };

export async function runDemoPath() {
  console.log('\nThe trial\'s demo payment simulates authorise / capture / release');
  const api = await startApi(4139, { APP_ENV: 'trial', ALLOW_MISSING_INTEGRATIONS: 'true', ...NO_KEYS });
  if (!api.base) { check('trial API started', false, api.log?.slice?.(-500)); return; }
  try {
    const o = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
    let r = await callAt(api.base, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: o.id, method: 'upi' } });
    check('demo payment of a prescription order is only authorised', r.status === 200 && r.json.data?.payment_status === 'authorized'
      && r.json.data.status === 'rx_pending', r.json);
    let pm = await payment(o.id);
    check('… recorded as a demo, manual-capture hold', pm.gateway === 'demo' && pm.capture_mode === 'manual' && pm.status === 'authorized', pm);
    r = await verifyRx(o.id, P.rx, 1);
    pm = await payment(o.id);
    const [aud] = await q(`SELECT new_value FROM audit_logs WHERE action = 'payment_captured' AND new_value->>'order_id' = $1`, [o.id]);
    check('the pharmacist\'s check passes → the demo capture is simulated (no gateway) and flagged demo', pm.status === 'captured'
      && aud?.new_value?.demo === true, { pm, aud });
    const o2 = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
    await callAt(api.base, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: o2.id, method: 'card' } });
    r = await call('POST', `/orders/${o2.id}/cancel`, { token: t.buyer, body: { reason: 'S39 demo test' } });
    check('a cancelled demo hold is released, no refund', (await payment(o2.id)).status === 'released' && !(await refunds(o2.id)).length, r.json);
    const o3 = (await placeOrder([{ product_id: P.rx, quantity: 1 }])).order;
    await q(`UPDATE prescriptions SET order_id = NULL WHERE order_id = $1`, [o3.id]);
    r = await callAt(api.base, 'POST', '/payments/demo', { token: t.buyer, body: { order_id: o3.id, method: 'upi' } });
    check('demo payment without a prescription attached → 422 PRESCRIPTION_REQUIRED', r.status === 422 && r.json.code === 'PRESCRIPTION_REQUIRED', r.json);
    await call('POST', `/orders/${o3.id}/cancel`, { token: t.buyer, body: { reason: 'S39 demo test' } });
  } finally { await api.stop(); }
}
