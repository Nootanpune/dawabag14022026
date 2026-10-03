// Sprint 41 security review #3 — a held prescription payment's capture never crosses a
// cancellation, and two callers never both capture (C-37): the capture runs under the
// order's row lock, which a cancellation takes first too.
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment, razorpay } from '../fakes/razorpay.mjs';
import { seen } from '../fakes/server.mjs';
import { P, payment, placeOrder, rxBody, rxOf, t } from '../sprint39/fixtures.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function authorised() {
  const { order } = await placeOrder([{ product_id: P.rx, quantity: 1 }]);
  const c = await call('POST', '/payments/create-order', { token: t.buyer, body: { order_id: order.id } });
  const p = checkoutPayment(c.json.data.razorpay_order_id, { status: 'authorized' });
  await call('POST', '/payments/verify', { token: t.buyer, body: p });
  return { order, paymentId: p.razorpay_payment_id };
}
const verifyRx = async (orderId) => call('POST', `/fulfilment/prescriptions/${await rxOf(orderId)}/verify`, { token: t.pharmacist, body: rxBody(P.rx, 1) });
const captureCalls = (paymentId) => seen.filter((s) => s.method === 'POST' && s.url.endsWith(`/payments/${paymentId}/capture`)).length;
const crossed = async (orderId) => (await q(
  `SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'payment_after_close_refunded' AND new_value->>'order_id' = $1`, [orderId]))[0].n;

export async function runCaptureRace() {
  console.log('\nC. Held payment: capture vs cancellation, and double capture');
  razorpay.captureDelayMs = 800;   // a slow gateway widens the window
  try {
    // The buyer cancels while the gateway is capturing (the pharmacist's check just passed)
    const a = await authorised();
    check('the prescription order is authorised, not charged', (await payment(a.order.id))?.status === 'authorized');
    const verifying = verifyRx(a.order.id);
    await sleep(250);
    const cancel = await call('POST', `/orders/${a.order.id}/cancel`, { token: t.buyer, body: { reason: 'S41 race test' } });
    const v = await verifying;
    const pm = await payment(a.order.id);
    const refunds = await q(`SELECT source, amount_paise FROM refunds WHERE order_id = $1`, [a.order.id]);
    check('a cancellation during the capture waits for it, then refunds as for any paid order', v.status === 200 && cancel.status === 200
      && ['captured', 'refunded', 'partially_refunded'].includes(pm.status) && refunds.length === 1, { v: v.json, cancel: cancel.json, pm, refunds });
    check('… never "captured after the hold was released" (the old crossing)', (await crossed(a.order.id)) === 0);
    check('… and the gateway was asked to capture exactly once', captureCalls(a.paymentId) === 1, captureCalls(a.paymentId));

    // The pharmacist's check and the payment-hold watch both try to capture
    const b = await authorised();
    const verifying2 = verifyRx(b.order.id);
    await sleep(150);
    const watch = await call('POST', '/admin/jobs/payment_hold_watch/run', { token: t.admin });
    const v2 = await verifying2;
    check('two captures at once (pharmacist check + watch job): one gateway capture, payment captured', v2.status === 200 && watch.status === 200
      && captureCalls(b.paymentId) === 1 && (await payment(b.order.id)).status === 'captured', { calls: captureCalls(b.paymentId), watch: watch.json.data?.summary });

    // Cancelled first: nothing is captured, the hold is released
    const c = await authorised();
    const cancel3 = await call('POST', `/orders/${c.order.id}/cancel`, { token: t.buyer, body: { reason: 'S41 race test' } });
    const v3 = await verifyRx(c.order.id);
    check('cancelled before the check: hold released, the gateway never asked to capture', cancel3.status === 200
      && (await payment(c.order.id)).status === 'released' && captureCalls(c.paymentId) === 0, { v3: v3.status, pm: await payment(c.order.id) });
  } finally { razorpay.captureDelayMs = 0; }
}
