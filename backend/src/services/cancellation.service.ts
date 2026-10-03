// src/services/cancellation.service.ts — order cancellation (Rulebook C-37, C-39)
// Buyers may cancel until packing starts; staff until dispatch. Cancelling
// releases reserved stock and prescription quantities, issues a credit note
// against each seller's invoice, and refunds what was paid (refund.service).
import { withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { creditWholeShipment } from './creditNote.service';
import { queueNotification } from './notification.service';
import { recordRefund, refundableAmount, sendGatewayRefunds } from './refund.service';
import { releaseOrderReservations } from './shipment.service';
import { releaseHeldPaymentTx } from './payments/rxHold/hold.service';

const OPEN = ['pending_payment', 'payment_failed', 'confirmed', 'rx_pending', 'rx_verified', 'rx_rejected', 'packing', 'packed'];

// actor.id null = the server itself (Sprint 39: a prescription order the pharmacist could not check in time)
export async function cancelOrder(orderId: string, actor: { id: string | null; staff: boolean }, reason: string) {
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

    // Everything paid and not yet refunded (refund.service is the single authority)
    const refundable = await refundableAmount(client, orderId);

    await releaseOrderReservations(client, orderId);
    // Give the prescription quantities back: a 'reversal' row in the append-only dispense
    // ledger for what each line still holds (Sprint 38, C-08). Lines dispensed before
    // Sprint 38 (no ledger row of their own) are not given back.
    await client.query(
      `INSERT INTO rx_dispense_ledger (prescription_id, product_id, kind, quantity, order_id, order_item_id, recorded_by, reason)
       SELECT l.prescription_id, l.product_id, 'reversal',
              SUM(CASE WHEN l.kind = 'reversal' THEN -l.quantity ELSE l.quantity END), $1, l.order_item_id, $2, 'Order cancelled'
       FROM rx_dispense_ledger l JOIN order_items oi ON oi.id = l.order_item_id
       WHERE oi.order_id = $1
       GROUP BY l.prescription_id, l.product_id, l.order_item_id
       HAVING SUM(CASE WHEN l.kind = 'reversal' THEN -l.quantity ELSE l.quantity END) > 0`,
      [orderId, actor.id]);
    const creditNotes = [];
    for (const s of shipments) creditNotes.push(await creditWholeShipment(client, s.id, 'cancellation', actor.id));
    await client.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancellation_reason = $3, updated_at = NOW()
       WHERE id = $1`, [orderId, actor.id, reason]);
    const refund = await recordRefund(client, { orderId, amountPaise: refundable, source: 'cancellation', userId: actor.id });
    // Sprint 39: a payment only authorised (prescription order before the pharmacist's check)
    // is released, never captured — the buyer is not charged at all (C-37)
    const released = await releaseHeldPaymentTx(client, orderId, reason, actor.id);
    await writeAuditTx(client, { userId: o.user_id, action: 'order_cancelled', performedBy: actor.id,
      newValue: { order_id: orderId, by_staff: actor.staff, refund_paise: refundable, released_paise: released, by_system: actor.id === null,
        credit_notes: creditNotes.filter(Boolean).map((c: any) => c.credit_note_number) }, notes: reason });
    return { o, refundable, refund, creditNotes, released };
  });

  await sendGatewayRefunds(result.refund.gatewayRefundIds);
  await queueNotification({ userId: result.o.user_id, type: 'order_cancelled', orderId, orderNumber: result.o.order_number,
    amountPaise: result.refundable, reason, notCharged: result.released > 0 });
  return {
    id: orderId, status: 'cancelled', refund_paise: result.refundable, refunds: result.refund.legs,
    released_paise: result.released,
    credit_notes: result.creditNotes.filter(Boolean).map((c: any) => c.credit_note_number),
  };
}
