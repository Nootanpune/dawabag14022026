// Razorpay Checkout (checkout.js) for orders and consultation fees. It opens Razorpay's
// own window, where the buyer picks UPI, card, netbanking or a wallet. Nothing is kept
// in the browser; the server confirms the payment by its signature and at the gateway.
declare global {
  interface Window { Razorpay: any }
}

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

export class PaymentWindowError extends Error {}

export function loadCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.Razorpay === 'function') return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new PaymentWindowError('We could not open the payment window. Please check your internet connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export interface CheckoutSuccess { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
export type CheckoutOutcome =
  | { kind: 'paid'; response: CheckoutSuccess }
  | { kind: 'dismissed' }
  | { kind: 'failed'; reason: string };

/** Opens Checkout and settles once: paid (to be verified by the server), closed, or failed. */
export async function openCheckout(o: { key: string; amount: number; orderId: string; description: string }): Promise<CheckoutOutcome> {
  await loadCheckout();
  return new Promise((resolve) => {
    let settled = false;
    let failure: string | null = null;
    const done = (r: CheckoutOutcome) => { if (!settled) { settled = true; resolve(r); } };
    const rzp = new window.Razorpay({
      key: o.key,
      amount: o.amount,
      currency: 'INR',
      name: 'Dawabag',
      description: o.description,
      order_id: o.orderId,
      handler: (response: CheckoutSuccess) => done({ kind: 'paid', response }),
      // Closing after a failed attempt reports the failure, not just "closed"
      modal: { ondismiss: () => done(failure ? { kind: 'failed', reason: failure } : { kind: 'dismissed' }), confirm_close: true },
      theme: { color: '#167A4C' },
    });
    // Razorpay lets the buyer retry inside its window; remember the reason for when they close it
    rzp.on?.('payment.failed', (r: any) => {
      failure = r?.error?.description ? `${r.error.description}` : 'The payment did not go through.';
    });
    rzp.open();
  });
}
