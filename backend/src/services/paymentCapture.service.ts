// src/services/paymentCapture.service.ts
// What happens to an order once its payment is captured — shared by the app's
// verify call and the Razorpay webhook (refill auto-charges arrive only there).
import { PoolClient } from 'pg';
import { effectiveCustomerType, requiresPrescription } from '../utils/customerType';

// Orders with prescription lines go to the pharmacist first (Rulebook C-08);
// licensed buyers are exempt, as at order time.
export async function moveOrderToFulfilment(client: PoolClient, orderId: string): Promise<string> {
  const buyer = (await client.query(
    `SELECT u.customer_type, u.kyc_status FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [orderId])).rows[0];
  const type = effectiveCustomerType(buyer?.customer_type, buyer?.kyc_status);
  const lines = (await client.query(
    `SELECT p.drug_schedule, oi.prescription_id FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1`,
    [orderId])).rows;
  // A prescription line already covered by a verified prescription needs no second review
  const waitingForRx = lines.some((l: any) => requiresPrescription(type, l.drug_schedule) && !l.prescription_id);
  const newStatus = waitingForRx ? 'rx_pending' : 'packing';
  await client.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND status IN ('pending_payment', 'payment_failed')`,
    [newStatus, orderId]);
  return newStatus;
}
