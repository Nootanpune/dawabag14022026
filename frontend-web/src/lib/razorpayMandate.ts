// Opens Razorpay Checkout for a recurring-payment mandate authorisation.
// Uses window.Razorpay only if the page already has it — no script is injected here,
// and nothing is stored on the device. The server activates the mandate from Razorpay's
// webhook; the UI just refetches.
import type { MandateCheckout } from './refills';

/** Returns false when Checkout is not available in this page. */
export function openMandateCheckout(c: MandateCheckout, onFinished: () => void): boolean {
  if (typeof window === 'undefined' || typeof window.Razorpay !== 'function') return false;
  const rzp = new window.Razorpay({
    key: c.key_id,
    order_id: c.razorpay_order_id,
    customer_id: c.customer_id,
    recurring: c.recurring,
    name: 'Dawabag',
    description: 'Automatic payment for refills',
    handler: onFinished,
    modal: { ondismiss: onFinished },
    theme: { color: '#167A4C' },
  });
  rzp.open();
  return true;
}
