// Pays a consultation fee through Razorpay Checkout — the same checkout.js the
// order payment step loads. Nothing is stored on the device; the server marks
// the consultation paid only after checking the signature.
import { startConsultationPayment, verifyConsultationPayment } from './api';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckout(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.Razorpay === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'));
    document.body.appendChild(script);
  });
}

/**
 * Opens checkout for the consultation fee. Resolves true once the server has
 * verified the payment, false if the patient closed the window.
 */
export async function payConsultation(consultationId: string, description: string): Promise<boolean> {
  const order = await startConsultationPayment(consultationId);
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount_paise,
      currency: 'INR',
      name: 'Dawabag',
      description,
      order_id: order.gateway_order_id,
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          await verifyConsultationPayment(consultationId, {
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
          });
          resolve(true);
        } catch (err) {
          reject(err);
        }
      },
      modal: { ondismiss: () => resolve(false) },
      theme: { color: '#167A4C' },
    });
    rzp.open();
  });
}
