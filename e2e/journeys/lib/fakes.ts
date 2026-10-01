// The fake providers (backend/test/fakes) running inside the recorder: Razorpay
// and the object store answer the API, and Razorpay Checkout in the browser is
// replaced by a stub that "pays" through the fake — no real payment is made.
import { BrowserContext } from '@playwright/test';
import { resolve } from 'path';

// A real dynamic import: the fakes are ES modules
const esm = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
const fakes = (f: string) => esm(resolve(__dirname, '../../../backend/test/fakes', f));

let started = false;
export async function startFakeProviders() {
  if (started) return;
  const { startFakes } = await fakes('server.mjs');
  await startFakes();
  started = true;
}

/** Every page in the context gets the Checkout stub (C-35 disclosures stay on the real pages). */
export async function useFakeCheckout(ctx: BrowserContext) {
  const { checkoutPayment } = await fakes('razorpay.mjs');
  await ctx.exposeFunction('__dawabagFakePay', (orderId: string) => checkoutPayment(orderId));
  await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.Razorpay = function (o) { this.open = async function () {
      const r = await window.__dawabagFakePay(o.order_id); o.handler(r); }; this.on = function () {}; };`,
  }));
}

/** Refunds wait at the fake Razorpay until settled, as real ones do for a few days (C-37) */
export async function holdGatewayRefunds(hold: boolean) {
  const { razorpay } = await fakes('razorpay.mjs');
  razorpay.refundStatus = hold ? 'pending' : 'processed';
}

/** The fake Razorpay settles a refund and tells the API through the signed refund.processed webhook */
export async function settleGatewayRefund(refundId: string) {
  const { razorpay, sendWebhook } = await fakes('razorpay.mjs');
  const r = razorpay.refunds.find((x: { id: string }) => x.id === refundId);
  if (!r) throw new Error(`The fake Razorpay has no refund ${refundId}`);
  r.status = 'processed';
  const res = await sendWebhook('refund.processed', { refund: { entity: { ...r } } });
  if (res.status >= 300) throw new Error(`refund.processed webhook: ${JSON.stringify(res.json)}`);
}

/** What Checkout hands back after a (fake) payment of a Razorpay order — for steps done through the API */
export async function fakeCheckoutPayment(orderId: string) {
  const { checkoutPayment } = await fakes('razorpay.mjs');
  return checkoutPayment(orderId) as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
}
