// Pays a consultation fee through Razorpay Checkout — the same checkout.js the order
// payment step uses (lib/payments/razorpayCheckout). Nothing is stored on the device; the
// server marks the consultation paid only after checking the signature.
import { openCheckout } from '../payments/razorpayCheckout';
import { startConsultationPayment, verifyConsultationPayment } from './api';

/**
 * Opens checkout for the consultation fee. Resolves true once the server has
 * verified the payment, false if the patient closed the window; throws with a
 * plain message when the payment failed.
 */
export async function payConsultation(consultationId: string, description: string): Promise<boolean> {
  const order = await startConsultationPayment(consultationId);
  const r = await openCheckout({ key: order.key_id, amount: order.amount_paise, orderId: order.gateway_order_id, description });
  if (r.kind === 'dismissed') return false;
  if (r.kind === 'failed') throw new Error(`Your payment did not go through (${r.reason}). No money was taken; please try again.`);
  await verifyConsultationPayment(consultationId, r.response);
  return true;
}
