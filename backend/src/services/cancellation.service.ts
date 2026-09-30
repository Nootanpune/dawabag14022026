// src/services/cancellation.service.ts — order cancellation (Rulebook C-37, C-39)
// Buyers may cancel until packing starts; staff until dispatch. Cancelling
// releases reserved stock and prescription quantities, issues a credit note
// against each seller's invoice, and refunds what was paid (refund.service).
import { withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { creditWholeShipment } from './creditNote.service';
import { queueNotification } from './notification.service';
import { recordRefund, sendGatewayRefunds } from './refund.service';
import { releaseOrderReservations } from './shipment.service';

const OPEN = ['pending_payment', 'payment_failed', 'confirmed', 'rx_pending', 'rx_verified', 'rx_rejected', 'packing', 'packed'];

export async function cancelOrder(orderId: string, actor: { id: string; staff: boolean }, reason: string) {
  const result = await withTransaction(async (client) => {
    const o = (await client.query(
      `SELECT id, user_id, order_number, status, total_paise, wallet_used_paise, payment_terms
       FROM orders WHERE id = $1 ${actor.staff ? '' : 'AND user_id = $2'} FOR UPDATE`,
      actor.staff ? [orderId] : [orderId, actor.id])).rows[0];
    if (!o) throw new AppError('Order not found', 404);
    if (o.status === 'cancelled') throw new AppError('Order is already cancelled', 409);
    if (!OPEN.includes(o.status)) throw new AppError(`A ${o.status} order cannot be cancelled; request a return instead`, 409);

    const shipments = (await client.query(
      `SELECT id, status FROM order_shipments WHERE order_id = $1 AND status <> 'cancelled'`, [orderId])).rows;
    const blocked = shipments.filter((s: any) => (actor.staff ? s.status !== 'pending' && s.status !== 'packed' : s.status !== 'pending'));
    if (blocked.length) {
      throw new AppError(actor.staff ? 'Part of this order has already been dispatched' : 'Packing has started; please contact support to cancel', 409);
    }

    // What the buyer actually paid (nothing for an unpaid prepaid order except wallet)
    const captured = Number((await client.query(
      `SELECT COALESCE(SUM(amount_paise - COALESCE(refund_amount_paise, 0)), 0) AS n FROM payments
       WHERE order_id = $1 AND status IN ('captured', 'partially_refunded')`, [orderId])).rows[0].n);
    const onCredit = o.payment_terms !== 'prepaid';
    const refundable = (onCredit ? o.total_paise : captured) + o.wallet_used_paise;

    await releaseOrderReservations(client, orderId);
    // Give the prescription quantities back
    await client.query(
      `UPDATE prescription_items pi SET dispensed_qty = GREATEST(pi.dispensed_qty - oi.quantity, 0)
       FROM order_items oi WHERE oi.order_id = $1 AND oi.prescription_id = pi.prescription_id AND oi.product_id = pi.product_id`,
      [orderId]);
    const creditNotes = [];
    for (const s of shipments) creditNotes.push(await creditWholeShipment(client, s.id, 'cancellation', actor.id));
    await client.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancellation_reason = $3, updated_at = NOW()
       WHERE id = $1`, [orderId, actor.id, reason]);
    const refund = await recordRefund(client, { orderId, amountPaise: refundable, source: 'cancellation', userId: actor.id });
    await writeAuditTx(client, { userId: o.user_id, action: 'order_cancelled', performedBy: actor.id,
      newValue: { order_id: orderId, by_staff: actor.staff, refund_paise: refundable,
        credit_notes: creditNotes.filter(Boolean).map((c: any) => c.credit_note_number) }, notes: reason });
    return { o, refundable, refund, creditNotes };
  });

  await sendGatewayRefunds(result.refund.gatewayRefundIds);
  await queueNotification({ userId: result.o.user_id, type: 'order_cancelled', orderId, orderNumber: result.o.order_number,
    amountPaise: result.refundable, reason });
  return {
    id: orderId, status: 'cancelled', refund_paise: result.refundable, refunds: result.refund.legs,
    credit_notes: result.creditNotes.filter(Boolean).map((c: any) => c.credit_note_number),
  };
}
