// Fake Razorpay (the REST API the official SDK calls): orders, payments, capture,
// refunds, customers and tokens, recurring charges and settlement lines — with
// basic-auth key checks — plus helpers that play Checkout and send signed webhooks.
// Switches: a payment id containing FAIL refuses refunds; refundStatus 'pending'
// leaves refunds for a later refund.processed webhook.
import crypto from 'crypto';

export const razorpay = { orders: new Map(), payments: new Map(), refunds: [], recurring: [], deletedTokens: [], extraSettlementLines: [], refundStatus: 'processed', loseNextRefundReply: false };
const rid = (p) => `${p}_${crypto.randomBytes(7).toString('hex')}`;
const today = () => new Date().toISOString().slice(0, 10);

// What Razorpay Checkout hands the app after the buyer pays an order
export function checkoutPayment(orderId, { status = 'captured', method = 'upi', tokenId, fail = false } = {}) {
  const o = razorpay.orders.get(orderId);
  const id = fail ? `pay_FAIL${crypto.randomBytes(5).toString('hex')}` : rid('pay');
  razorpay.payments.set(id, { id, entity: 'payment', order_id: orderId, amount: o?.amount ?? 0, currency: 'INR', status, method,
    ...(tokenId ? { token_id: tokenId } : {}), captured: status === 'captured', created_at: Math.floor(Date.now() / 1000) });
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${id}`).digest('hex');
  return { razorpay_order_id: orderId, razorpay_payment_id: id, razorpay_signature: signature };
}

// Sprint 39: the manual-capture window ended at the gateway — the authorisation went back to the buyer
export function expireAuthorisation(paymentId) {
  const p = razorpay.payments.get(paymentId);
  if (p && p.status === 'authorized') { p.status = 'refunded'; p.captured = false; }
  return p;
}

// Razorpay calling the API's webhook, signed over the exact bytes sent
export async function sendWebhook(event, payload, eventId = rid('evt'), createdAt = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify({ entity: 'event', event, payload, created_at: createdAt });
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  const res = await fetch(`${process.env.API_URL || 'http://localhost:4000'}/api/v1/payments/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': eventId }, body: raw });
  return { status: res.status, json: await res.json().catch(() => ({})), eventId };
}

function settlementLines(day) {
  if (day !== today()) return [];
  const settledAt = Math.floor(Date.now() / 1000);
  const fee = (a) => Math.round(a * 0.02), tax = (a) => Math.round(fee(a) * 0.18);
  const pays = [...razorpay.payments.values()].filter((p) => p.status === 'captured' || p.status === 'refunded').map((p) => ({
    entity_id: p.id, type: 'payment', amount: p.amount, fee: fee(p.amount), tax: tax(p.amount), credit: p.amount - fee(p.amount) - tax(p.amount), debit: 0,
    order_id: p.order_id, settled_at: settledAt, settlement_id: 'setl_fake1', settlement_utr: 'UTRFAKE0001' }));
  const refs = razorpay.refunds.filter((r) => r.status === 'processed').map((r) => ({
    entity_id: r.id, type: 'refund', amount: r.amount, fee: 0, tax: 0, credit: 0, debit: r.amount, payment_id: r.payment_id,
    settled_at: settledAt, settlement_id: 'setl_fake1', settlement_utr: 'UTRFAKE0001' }));
  return [...pays, ...refs, ...razorpay.extraSettlementLines];
}

export function razorpayRoute(req, body) {
  const url = new URL(req.url, 'http://x');
  if (!/^\/v1\/(orders|payments|customers|settlements)(\/|$)/.test(url.pathname)) return null;   // other /v1/ paths are FCM and Shiprocket
  const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
  if (auth !== `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`) {
    return [401, { error: { code: 'BAD_REQUEST_ERROR', description: 'The api key provided is invalid' } }];
  }
  const b = body ? JSON.parse(body) : {};
  const path = url.pathname;
  const notFound = [400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } }];
  if (req.method === 'POST' && path === '/v1/orders') {
    if (!Number.isInteger(b.amount) || b.amount < 100) return [400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Order amount less than minimum amount allowed' } }];
    // Sprint 39: the capture options asked for (payment.capture 'manual' for prescription orders) are kept for the tests
    const o = { id: rid('order'), entity: 'order', amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes, status: 'created',
      payment_capture: b.payment_capture, payment: b.payment };
    razorpay.orders.set(o.id, o);
    return [200, o];
  }
  let m = path.match(/^\/v1\/orders\/([^/]+)\/payments$/);
  if (req.method === 'GET' && m) return [200, { entity: 'collection', items: [...razorpay.payments.values()].filter((p) => p.order_id === m[1]) }];
  if (req.method === 'POST' && path === '/v1/customers') return [200, { id: rid('cust'), entity: 'customer', name: b.name, contact: b.contact, email: b.email }];
  m = path.match(/^\/v1\/customers\/([^/]+)\/tokens\/([^/]+)$/);
  if (req.method === 'DELETE' && m) { razorpay.deletedTokens.push(m[2]); return [200, { deleted: true }]; }
  if (req.method === 'POST' && path === '/v1/payments/create/recurring') {
    const o = razorpay.orders.get(b.order_id);
    if (!o || o.amount !== b.amount) return [400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Order mismatch' } }];
    const id = rid('pay');
    razorpay.payments.set(id, { id, entity: 'payment', order_id: b.order_id, amount: b.amount, currency: 'INR', status: 'captured', method: 'upi', token_id: b.token, captured: true });
    razorpay.recurring.push({ ...b, payment_id: id });
    return [200, { razorpay_payment_id: id, razorpay_order_id: b.order_id }];
  }
  m = path.match(/^\/v1\/payments\/([^/]+)$/);
  if (req.method === 'GET' && m) return razorpay.payments.has(m[1]) ? [200, razorpay.payments.get(m[1])] : notFound;
  m = path.match(/^\/v1\/payments\/([^/]+)\/capture$/);
  if (req.method === 'POST' && m) {
    const p = razorpay.payments.get(m[1]);
    if (!p) return notFound;
    if (p.status !== 'authorized' || p.amount !== b.amount) return [400, { error: { code: 'BAD_REQUEST_ERROR', description: 'This payment has already been captured' } }];
    p.status = 'captured'; p.captured = true;
    return [200, p];
  }
  m = path.match(/^\/v1\/payments\/([^/]+)\/refund$/);
  if (req.method === 'POST' && m) {
    if (m[1].includes('FAIL')) return [400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The payment has been fully refunded already' } }];
    const r = { id: rid('rfnd'), entity: 'refund', payment_id: m[1], amount: b.amount, status: razorpay.refundStatus, notes: b.notes };
    razorpay.refunds.push(r);
    // The refund is made but the reply never arrives (timeout)
    if (razorpay.loseNextRefundReply) { razorpay.loseNextRefundReply = false; return [502, { error: { code: 'SERVER_ERROR', description: 'Gateway timeout' } }]; }
    return [200, r];
  }
  m = path.match(/^\/v1\/payments\/([^/]+)\/refunds$/);
  if (req.method === 'GET' && m) return [200, { entity: 'collection', items: razorpay.refunds.filter((x) => x.payment_id === m[1]) }];
  if (req.method === 'GET' && path === '/v1/settlements/recon/combined') {
    const day = `${url.searchParams.get('year')}-${String(url.searchParams.get('month')).padStart(2, '0')}-${String(url.searchParams.get('day')).padStart(2, '0')}`;
    const items = settlementLines(day);
    return [200, { entity: 'collection', count: items.length, items }];
  }
  return [404, { error: { code: 'BAD_REQUEST_ERROR', description: 'The requested URL was not found on the server.' } }];
}
