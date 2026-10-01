// Fake Razorpay (the REST API the official SDK calls): orders and refunds, with
// basic-auth key checks. A payment id containing FAIL makes its refund fail.
import crypto from 'crypto';

export const razorpay = { orders: new Map(), refunds: [] };

// What Razorpay Checkout hands the app after a successful payment
export function checkoutPayment(orderId) {
  const paymentId = `pay_${crypto.randomBytes(7).toString('hex')}`;
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature };
}

export function razorpayRoute(req, body) {
  if (!/^\/v1\/(orders|payments|customers)(\/|$)/.test(req.url)) return null;   // other /v1/ paths are FCM and Shiprocket
  const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
  if (auth !== `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`) {
    return [401, { error: { code: 'BAD_REQUEST_ERROR', description: 'The api key provided is invalid' } }];
  }
  const b = body ? JSON.parse(body) : {};
  if (req.method === 'POST' && req.url === '/v1/orders') {
    if (!Number.isInteger(b.amount) || b.amount < 100) return [400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Order amount less than minimum amount allowed' } }];
    const o = { id: `order_${crypto.randomBytes(7).toString('hex')}`, entity: 'order', amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes, status: 'created' };
    razorpay.orders.set(o.id, o);
    return [200, o];
  }
  if (req.method === 'POST' && req.url === '/v1/customers') {
    return [200, { id: `cust_${crypto.randomBytes(7).toString('hex')}`, entity: 'customer', name: b.name, contact: b.contact, email: b.email }];
  }
  const refund = req.url.match(/^\/v1\/payments\/([^/]+)\/refund$/);
  if (req.method === 'POST' && refund) {
    if (refund[1].includes('FAIL')) return [400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The payment has been fully refunded already' } }];
    const r = { id: `rfnd_${crypto.randomBytes(7).toString('hex')}`, entity: 'refund', payment_id: refund[1], amount: b.amount, status: 'processed', notes: b.notes };
    razorpay.refunds.push(r);
    return [200, r];
  }
  return [404, { error: { code: 'BAD_REQUEST_ERROR', description: 'The requested URL was not found on the server.' } }];
}
