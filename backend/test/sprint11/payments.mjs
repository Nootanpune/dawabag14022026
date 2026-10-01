// Payments end to end against the fake Razorpay: checkout, webhooks, refunds,
// the reconciliation sweep, mandates and refill charges, settlement report
import { call, check, q } from '../sprint5/lib.mjs';
import { checkoutPayment, razorpay, sendWebhook } from '../fakes/razorpay.mjs';
import { payment, pendingOrder, status } from './fixtures.mjs';

const captured = (p) => ({ payment: { entity: p } });

export async function runPayments(ctx) {
  const { t, ids } = ctx;
  const startCheckout = async (o, token = t.buyer) => (await call('POST', '/payments/create-order', { token, body: { order_id: o.id } })).json.data;

  console.log('Checkout');
  const o1 = await pendingOrder(ctx);
  const c1 = await startCheckout(o1);
  check('Razorpay order made for the order total', razorpay.orders.get(c1?.razorpay_order_id)?.amount === o1.total_paise, c1);
  const pay1 = checkoutPayment(c1.razorpay_order_id, { status: 'authorized' });
  let r = await call('POST', '/payments/verify', { token: t.buyer, body: { ...pay1, razorpay_signature: '0'.repeat(64) } });
  check('a forged checkout signature is refused', r.status === 400, r.json);
  r = await call('POST', '/payments/verify', { token: t.other, body: pay1 });
  check("another buyer cannot confirm this payment", r.status === 404, r.status);
  r = await call('POST', '/payments/verify', { token: t.buyer, body: pay1 });
  check('an authorised-only payment is captured, then the order goes to packing', r.status === 200 && r.json.data.status === 'packing'
    && razorpay.payments.get(pay1.razorpay_payment_id).status === 'captured', r.json);
  r = await call('POST', '/payments/verify', { token: t.buyer, body: pay1 });
  const p1 = await payment(o1.id);
  check('confirming twice records it once', r.status === 200 && p1.status === 'captured' && p1.gateway_payment_id === pay1.razorpay_payment_id, { r: r.json, p1 });

  console.log('Webhooks');
  r = await call('POST', '/payments/webhook', { body: { event: 'payment.captured', payload: {} } });
  check('unsigned webhook refused', r.status === 400, r.status);
  const o2 = await pendingOrder(ctx);
  const c2 = await startCheckout(o2);
  const pay2 = checkoutPayment(c2.razorpay_order_id);
  r = await sendWebhook('payment.captured', captured(razorpay.payments.get(pay2.razorpay_payment_id)), 'evt_s11_a');
  check('the app never confirmed, the webhook did: order paid', r.status === 200 && /order paid/.test(r.json.outcome) && (await status(o2.id)) === 'packing', r.json);
  r = await sendWebhook('payment.captured', captured(razorpay.payments.get(pay2.razorpay_payment_id)), 'evt_s11_a');
  check('Razorpay retrying the same event: acknowledged, not acted on', r.json.duplicate === true, r.json);
  r = await sendWebhook('payment.captured', captured(razorpay.payments.get(pay2.razorpay_payment_id)), 'evt_s11_b');
  check('a second event for the same payment changes nothing', /already recorded/.test(r.json.outcome), r.json);
  const ev = (await q(`SELECT event, entity_id, amount_paise, outcome FROM payment_webhook_events WHERE event_id = 'evt_s11_a'`))[0];
  check('events kept with ids, amount and outcome only', ev?.entity_id === pay2.razorpay_payment_id && ev.amount_paise === o2.total_paise && /order paid/.test(ev.outcome), ev);

  const o3 = await pendingOrder(ctx);
  const c3 = await startCheckout(o3);
  await sendWebhook('payment.failed', { payment: { entity: { id: 'pay_s11_failed', order_id: c3.razorpay_order_id, amount: o3.total_paise, status: 'failed' } } });
  check('payment.failed marks the order', (await status(o3.id)) === 'payment_failed', await status(o3.id));
  const pay3 = checkoutPayment(c3.razorpay_order_id);
  await sendWebhook('payment.captured', captured(razorpay.payments.get(pay3.razorpay_payment_id)));
  check('a later successful retry still goes through', (await status(o3.id)) === 'packing', await status(o3.id));
  await sendWebhook('payment.failed', { payment: { entity: { id: 'pay_s11_late', order_id: c3.razorpay_order_id, amount: o3.total_paise } } });
  check('a late failure never undoes a capture', (await payment(o3.id)).status === 'captured' && (await status(o3.id)) === 'packing');

  const o4 = await pendingOrder(ctx);
  const c4 = await startCheckout(o4);
  r = await call('POST', `/orders/${o4.id}/cancel`, { token: t.buyer, body: { reason: 'Changed my mind' } });
  const pay4 = checkoutPayment(c4.razorpay_order_id);
  r = await sendWebhook('payment.captured', captured(razorpay.payments.get(pay4.razorpay_payment_id)));
  const back4 = await q(`SELECT method, status, amount_paise, gateway_refund_id FROM refunds WHERE order_id = $1`, [o4.id]);
  check('money arriving for a cancelled order goes straight back (C-37)', /refunded/.test(r.json.outcome) && back4.length === 1
    && back4[0].amount_paise === o4.total_paise && back4[0].status === 'processed' && razorpay.refunds.some((x) => x.payment_id === pay4.razorpay_payment_id), { out: r.json, back4 });

  console.log('Refunds settled by webhook, failures retried');
  razorpay.refundStatus = 'pending';
  r = await call('POST', '/payments/refund', { token: t.admin, body: { order_id: o1.id, amount_paise: 1000, reason: 'Goodwill' } });
  let leg = (await q(`SELECT id, status, gateway_refund_id FROM refunds WHERE order_id = $1`, [o1.id]))[0];
  check('gateway refund sent; waits for Razorpay', r.status === 200 && leg.status === 'pending' && /^rfnd_/.test(leg.gateway_refund_id || ''), leg);
  r = await sendWebhook('refund.processed', { refund: { entity: { id: leg.gateway_refund_id, payment_id: pay1.razorpay_payment_id, amount: 1000, status: 'processed' } } });
  leg = (await q(`SELECT status FROM refunds WHERE id = $1`, [leg.id]))[0];
  check('refund.processed settles it; payment shows a partial refund', leg.status === 'processed' && (await payment(o1.id)).status === 'partially_refunded', { leg, out: r.json });
  r = await call('POST', '/payments/refund', { token: t.admin, body: { order_id: o2.id, amount_paise: 2000, reason: 'Late delivery' } });
  let leg2 = (await q(`SELECT id, gateway_refund_id FROM refunds WHERE order_id = $1`, [o2.id]))[0];
  r = await call('POST', `/returns/refunds/admin/${leg2.id}/retry`, { token: t.admin });
  check('a refund still with the gateway cannot be resent', r.status === 409, r.json);
  await sendWebhook('refund.failed', { refund: { entity: { id: leg2.gateway_refund_id, amount: 2000, status: 'failed', error_description: 'Bank account closed' } } });
  leg2 = (await q(`SELECT id, status, failure_reason FROM refunds WHERE id = $1`, [leg2.id]))[0];
  check('refund.failed leaves it pending with the reason for accounts', leg2.status === 'pending' && /Bank account closed/.test(leg2.failure_reason || ''), leg2);
  razorpay.refundStatus = 'processed';
  r = await call('POST', `/returns/refunds/admin/${leg2.id}/retry`, { token: t.buyer });
  check('buyers cannot resend refunds', r.status === 403, r.status);
  r = await call('POST', `/returns/refunds/admin/${leg2.id}/retry`, { token: t.admin });
  check('accounts resends it: processed on the second attempt', r.json.data?.status === 'processed' && r.json.data.gateway_attempts === 2, r.json);
  await sendWebhook('refund.processed', { refund: { entity: { id: 'rfnd_not_ours', amount: 500, status: 'processed' } } });
  check('a refund made outside Dawabag is only noted', (await q(`SELECT outcome FROM payment_webhook_events WHERE entity_id = 'rfnd_not_ours'`))[0]?.outcome === 'refund not in ledger');

  console.log('Reconciliation sweep (lost confirmations)');
  const o5 = await pendingOrder(ctx);
  const c5 = await startCheckout(o5);
  checkoutPayment(c5.razorpay_order_id);   // paid, but the app closed and the webhook never came
  await q(`UPDATE payments SET created_at = NOW() - INTERVAL '20 minutes' WHERE order_id = $1`, [o5.id]);
  r = await call('POST', '/admin/jobs/payment_reconcile/run', { token: t.admin });
  check('the sweep finds the captured payment at Razorpay and records it', (await status(o5.id)) === 'packing', { job: r.json, status: await status(o5.id) });

  console.log('Mandates and refill charges');
  r = await call('POST', '/refills/mandates', { token: t.buyer, body: { max_amount_paise: 500000, method: 'upi' } });
  const m1 = r.json.data;
  const auth1 = checkoutPayment(m1.razorpay_order_id, { tokenId: 'token_s11_upi' });
  r = await sendWebhook('payment.captured', captured(razorpay.payments.get(auth1.razorpay_payment_id)));
  let mrow = (await q(`SELECT status, gateway_token_id FROM payment_mandates WHERE id = $1`, [m1.mandate_id]))[0];
  check('the ₹1 authorisation activates the mandate with its token', r.json.outcome === 'mandate authorised' && mrow.status === 'active' && mrow.gateway_token_id === 'token_s11_upi', { out: r.json, mrow });
  r = await call('POST', '/refills/mandates', { token: t.buyer, body: { max_amount_paise: 300000, method: 'card' } });
  const m2 = r.json.data;
  r = await sendWebhook('token.rejected', { token: { entity: { id: 'token_s11_rejected', customer_id: m2.customer_id } } });
  check('a rejected mandate is marked failed', (await q(`SELECT status FROM payment_mandates WHERE id = $1`, [m2.mandate_id]))[0].status === 'failed', r.json);

  r = await call('POST', '/refills', { token: t.buyer, body: { order_id: o5.id, frequency_days: 30 } });
  const sub = r.json.data;
  const subId = sub?.id ?? (await q(`SELECT id FROM refill_subscriptions WHERE user_id = $1`, [ids.buyer]))[0]?.id;
  r = await call('PATCH', `/refills/${subId}`, { token: t.buyer, body: { mandate_id: m1.mandate_id } });
  check('buyer puts the refill on the mandate', r.status === 200, r.json);
  await q(`UPDATE refill_subscriptions SET next_refill_date = CURRENT_DATE, auto_charge = TRUE WHERE id = $1`, [subId]);
  r = await call('POST', '/admin/jobs/refill_orders/run', { token: t.admin });
  const rec = razorpay.recurring.find((x) => x.token === 'token_s11_upi');
  const refillOrder = (await q(`SELECT o.id FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.gateway_order_id = $1`, [rec?.order_id]))[0];
  check('the refill is charged on the mandate token', !!rec && !!refillOrder && rec.recurring === '1', { job: r.json, rec });
  if (rec) {
    await sendWebhook('payment.captured', captured(razorpay.payments.get(rec.payment_id)));
    check('…and the captured charge sends the refill order to packing', (await status(refillOrder.id)) === 'packing', await status(refillOrder?.id));
  }
  r = await call('DELETE', `/refills/mandates/${m1.mandate_id}`, { token: t.buyer });
  const left = (await q(`SELECT mandate_id, auto_charge FROM refill_subscriptions WHERE id = $1`, [subId]))[0];
  check('cancelling the mandate deletes the token at Razorpay and stops auto-charge', razorpay.deletedTokens.includes('token_s11_upi') && left.mandate_id === null && left.auto_charge === false, left);

  console.log('Settlement reconciliation for the CA');
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  razorpay.extraSettlementLines.push({ entity_id: 'pay_s11_stranger', type: 'payment', amount: 777, fee: 15, tax: 3, credit: 759, debit: 0, settled_at: Math.floor(Date.now() / 1000), settlement_utr: 'UTRFAKE0001' });
  razorpay.extraSettlementLines.push({ entity_id: pay2.razorpay_payment_id + '', type: 'payment', amount: o2.total_paise + 1, fee: 0, tax: 0, credit: 0, debit: 0, settled_at: Math.floor(Date.now() / 1000) });
  r = await call('GET', `/accounts/reports/payment-reconciliation?from=${today}&to=${today}`, { token: t.admin });
  const rows = r.json.data?.rows ?? [];
  const row = (id, type = 'payment') => rows.filter((x) => x.gateway_id === id && x.type === type);
  check('settled payments matched to Dawabag orders with fees and UTR', row(pay1.razorpay_payment_id)[0]?.status === 'matched'
    && row(pay1.razorpay_payment_id)[0].fee_paise > 0 && row(pay1.razorpay_payment_id)[0].settlement_utr === 'UTRFAKE0001', row(pay1.razorpay_payment_id));
  const legId = (await q(`SELECT gateway_refund_id FROM refunds WHERE order_id = $1 AND status = 'processed'`, [o4.id]))[0].gateway_refund_id;
  check('settled refunds matched too', row(legId, 'refund')[0]?.status === 'matched', row(legId, 'refund'));
  check('a settlement line Dawabag does not know is flagged', row('pay_s11_stranger')[0]?.status === 'missing_in_dawabag', row('pay_s11_stranger'));
  check('an amount that disagrees is flagged', row(pay2.razorpay_payment_id).some((x) => x.status === 'amount_mismatch'), row(pay2.razorpay_payment_id));
  r = await call('GET', `/accounts/reports/payment-reconciliation?from=2026-01-01&to=2026-03-01`, { token: t.admin });
  check('the period is limited to 31 days (the gateway is asked day by day)', r.status === 400, r.json);
  r = await call('GET', `/accounts/reports/payment-reconciliation?from=${today}&to=${today}&format=csv`, { token: t.admin, raw: true });
  check('…and downloads as CSV', r.status === 200 && /text\/csv/.test(r.type) && r.buf.toString().startsWith('settled_on,type,gateway_id'), r.status);
}
