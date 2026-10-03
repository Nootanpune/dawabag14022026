// Money for order changes made while the payment was only authorised (Sprint 43; rules.ts).
// Kept apart from edit.service so the capture path can use it without an import cycle.
import { PoolClient } from 'pg';
import { recordRefund, refundableAmount } from '../refund.service';

/**
 * Inside a held payment's capture (capture.service): the money for changes made while the
 * payment was only authorised goes back now (Razorpay captures the authorised amount in full).
 * Returns the gateway refund ids to send after commit.
 */
export async function refundEditsAfterCaptureTx(client: PoolClient, orderId: string): Promise<string[]> {
  const due = (await client.query(
    `SELECT id, refund_paise FROM order_edits WHERE order_id = $1 AND refund_status = 'after_capture' ORDER BY edited_at FOR UPDATE`, [orderId])).rows;
  if (!due.length) return [];
  const ids: string[] = [];
  for (const e of due) {
    const amount = Math.min(Number(e.refund_paise), await refundableAmount(client, orderId));
    if (amount > 0) ids.push(...(await recordRefund(client, { orderId, amountPaise: amount, source: 'order_edit', userId: null })).gatewayRefundIds);
    await client.query(`UPDATE order_edits SET refund_status = 'recorded', refund_recorded_at = NOW() WHERE id = $1`, [e.id]);
  }
  return ids;
}

/** Inside a cancellation: a held payment is released, so changes made under it need no refund. */
export async function closeEditRefundsTx(client: PoolClient, orderId: string): Promise<void> {
  await client.query(`UPDATE order_edits SET refund_status = 'not_needed' WHERE order_id = $1 AND refund_status = 'after_capture'`, [orderId]);
}
