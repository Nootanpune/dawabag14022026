// Changing an order before packing (Sprint 43, URS-074; rules and wording in rules.ts).
// One transaction under the order lock (the same lock a cancellation and a held-payment
// capture take): credit note per affected seller (C-30, C-31), stock and partner
// reservations given back, prescription quantities given back (C-08 ledger), the buyer's
// share refunded through the refund ledger now or right after the capture (C-37), the
// change kept in order_edits and the audit log (C-46).
import { PoolClient } from 'pg';
import { query, withTransactionRetry } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { effectiveCustomerType } from '../../utils/customerType';
import { rxRequiredLines } from '../rxGate.service';
import { issueCreditNote } from '../creditNote.service';
import { recordRefund, refundableAmount, sendGatewayRefunds } from '../refund.service';
import { captureHeldPaymentQuietly } from '../payments/rxHold/hold.service';
import { buyerShare, editBlockReason, EditRefused, EditRequestLine, planEdit, refundTiming } from './rules';

export interface EditInput { lines: EditRequestLine[]; reason?: string }

/** Lines of an order with what is still to be supplied and the buyer's minimum per line. */
async function editableLines(client: PoolClient | null, orderId: string, buyerType: string) {
  const minCol = buyerType === 'b2b_retailer' ? 'COALESCE(p.min_order_qty_retailer, 1)'
    : buyerType === 'b2b_wholesaler' ? 'COALESCE(p.min_order_qty_wholesaler, 10)' : '1';
  const sql = `SELECT oi.id AS order_item_id, oi.product_name, oi.quantity, oi.supply_qty, oi.removed_qty, oi.shipment_id,
                      oi.batch_id, oi.product_id, p.drug_schedule, oi.prescription_id, ${minCol}::int AS min_qty
               FROM order_items oi JOIN products p ON p.id = oi.product_id
               WHERE oi.order_id = $1 ORDER BY oi.product_name, oi.id`;
  return client ? (await client.query(sql, [orderId])).rows : await query<any>(sql, [orderId]);
}

/** For the order page: may the buyer change it now, and the changes made so far. */
export async function orderEditState(order: { id: string; status: string; payment_terms?: string | null }, shipments: { status: string }[]) {
  const reason = editBlockReason(order, shipments);
  const edits = await query<any>(
    `SELECT e.id, e.edited_at, e.lines, e.credit_notes, e.refund_paise, e.refund_status, e.refund_recorded_at
     FROM order_edits e WHERE e.order_id = $1 ORDER BY e.edited_at`, [order.id]);
  return { can_edit: reason === null, edit_block_reason: reason, edits };
}

export async function editOrder(userId: string, orderId: string, input: EditInput) {
  const out = await withTransactionRetry(async (client) => {
    // Order first (the lock a cancellation and a held capture take), then its shipments
    const o = (await client.query(
      `SELECT o.id, o.user_id, o.order_number, o.status, o.payment_terms, o.subtotal_paise, o.gst_paise, o.discount_paise,
              u.customer_type, u.kyc_status
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1 AND o.user_id = $2 AND o.deleted_at IS NULL FOR UPDATE OF o`,
      [orderId, userId])).rows[0];
    if (!o) throw new AppError('Order not found', 404);
    const shipments = (await client.query(
      `SELECT id, status, seller_type, partner_id FROM order_shipments WHERE order_id = $1 ORDER BY id FOR UPDATE`, [orderId])).rows;
    const blocked = editBlockReason(o, shipments);
    if (blocked) throw new AppError(blocked, 409, true, 'ORDER_NOT_EDITABLE');

    const buyerType = effectiveCustomerType(o.customer_type, o.kyc_status);
    const lines = await editableLines(client, orderId, buyerType);
    let plan;
    try {
      plan = planEdit(lines.filter((l: any) => l.supply_qty > 0 || input.lines.some((r) => r.order_item_id === l.order_item_id)), input.lines);
    } catch (e) {
      if (e instanceof EditRefused) throw new AppError(e.message, e.status, true, e.code);
      throw e;
    }
    const byId = new Map(lines.map((l: any) => [l.order_item_id, l]));

    // One credit note per seller (shipment) whose lines change
    const perShipment = new Map<string, typeof plan>();
    for (const c of plan) {
      const sid = byId.get(c.order_item_id).shipment_id;
      if (!perShipment.has(sid)) perShipment.set(sid, []);
      perShipment.get(sid)!.push(c);
    }
    const creditNotes: { credit_note_number: string; shipment_id: string; total_paise: number }[] = [];
    let share = 0;
    for (const [shipmentId, changes] of perShipment) {
      const cn = await issueCreditNote(client, { shipmentId, reason: 'order_edit', userId,
        lines: changes.map((c) => ({ order_item_id: c.order_item_id, quantity: c.removed })) });
      creditNotes.push({ credit_note_number: cn.credit_note_number, shipment_id: shipmentId, total_paise: cn.total_paise });
      share += buyerShare(cn.total_paise, o);
      for (const c of changes) {
        const l = byId.get(c.order_item_id);
        await client.query(`UPDATE order_items SET removed_qty = removed_qty + $2 WHERE id = $1`, [c.order_item_id, c.removed]);
        // Reserved stock goes back on the shelf: Dawabag's batch, or the partner's (its own ledger)
        if (l.batch_id) {
          await client.query(`UPDATE inventory_batches SET quantity_reserved = GREATEST(quantity_reserved - $2, 0) WHERE id = $1`, [l.batch_id, c.removed]);
        }
        const credited = (await client.query(
          `SELECT ci.taxable_paise, ci.gst_paise FROM credit_note_items ci JOIN credit_notes n ON n.id = ci.credit_note_id
           WHERE n.credit_note_number = $1 AND ci.order_item_id = $2`, [cn.credit_note_number, c.order_item_id])).rows[0];
        const poi = (await client.query(
          `UPDATE partner_order_items SET allocated_qty = allocated_qty - $2,
             line_value_paise = GREATEST(line_value_paise - $3, 0), line_gst_paise = GREATEST(line_gst_paise - $4, 0)
           WHERE order_item_id = $1 AND dispatch_status = 'pending' RETURNING partner_inv_id`,
          [c.order_item_id, c.removed, credited?.taxable_paise ?? 0, credited?.gst_paise ?? 0])).rows[0];
        if (poi?.partner_inv_id) {
          await client.query(`UPDATE partner_inventory SET qty_reserved = GREATEST(qty_reserved - $2, 0), last_updated_at = NOW() WHERE id = $1`,
            [poi.partner_inv_id, c.removed]);
        }
        // Prescription quantities this line had taken are given back (append-only ledger, Sprint 38)
        await client.query(
          `INSERT INTO rx_dispense_ledger (prescription_id, product_id, kind, quantity, order_id, order_item_id, recorded_by, reason)
           SELECT l.prescription_id, l.product_id, 'reversal', LEAST($3::int, SUM(CASE WHEN l.kind = 'reversal' THEN -l.quantity ELSE l.quantity END)::int),
                  $1, l.order_item_id, $4, 'Order changed by the buyer'
           FROM rx_dispense_ledger l WHERE l.order_item_id = $2
           GROUP BY l.prescription_id, l.product_id, l.order_item_id
           HAVING SUM(CASE WHEN l.kind = 'reversal' THEN -l.quantity ELSE l.quantity END) > 0`,
          [orderId, c.order_item_id, c.removed, userId]);
      }
      // A seller whose every line came off: its parcel is not made at all
      const left = Number((await client.query(`SELECT COALESCE(SUM(supply_qty), 0)::int AS n FROM order_items WHERE shipment_id = $1`, [shipmentId])).rows[0].n);
      if (left === 0) {
        await client.query(`UPDATE partner_order_items SET dispatch_status = 'cancelled' WHERE shipment_id = $1 AND dispatch_status = 'pending'`, [shipmentId]);
        await client.query(`UPDATE order_shipments SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`, [shipmentId]);
      }
    }

    // Prescription lines all gone from an order waiting for the prescription check → on to packing (C-08)
    if (o.status === 'rx_pending' && !(await rxRequiredLines(client, orderId)).some((l) => !l.prescription_id)) {
      await client.query(`UPDATE orders SET status = 'packing', updated_at = NOW() WHERE id = $1 AND status = 'rx_pending'`, [orderId]);
    }

    // Money back: now (captured / wallet / credit bill), or straight after the held payment is captured
    const held = (await client.query(`SELECT 1 FROM payments WHERE order_id = $1 AND status = 'authorized'`, [orderId])).rows.length > 0;
    const timing = refundTiming({ paymentTerms: o.payment_terms, heldPayment: held });
    let refundIds: string[] = [];
    let refundLegs: any[] = [];
    let refundPaise = share;
    let status: string = 'none';
    if (share > 0 && timing === 'now') {
      refundPaise = Math.min(share, await refundableAmount(client, orderId));
      const r = await recordRefund(client, { orderId, amountPaise: refundPaise, source: 'order_edit', userId });
      refundIds = r.gatewayRefundIds; refundLegs = r.legs;
      status = refundPaise > 0 ? 'recorded' : 'none';
    } else if (share > 0) {
      status = 'after_capture';
    }
    const edit = (await client.query(
      `INSERT INTO order_edits (order_id, edited_by, lines, credit_notes, refund_paise, refund_status, refund_recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6::varchar, CASE WHEN $6::varchar = 'recorded' THEN NOW() END) RETURNING id, edited_at`,
      [orderId, userId, JSON.stringify(plan.map(({ order_item_id, product_name, from_qty, to_qty }) => ({ order_item_id, product_name, from_qty, to_qty }))),
        JSON.stringify(creditNotes), refundPaise, status])).rows[0];
    await writeAuditTx(client, { userId: o.user_id, action: 'order_edited', performedBy: userId,
      newValue: { order_id: orderId, order_number: o.order_number, edit_id: edit.id, lines: plan, credit_notes: creditNotes.map((c) => c.credit_note_number),
        refund_paise: refundPaise, refund_status: status }, notes: input.reason?.slice(0, 500) });
    return { edit, plan, creditNotes, refundPaise, status, refundIds, refundLegs, held };
  });

  await sendGatewayRefunds(out.refundIds);
  // Removing the last prescription line may make a held payment ready for capture (Sprint 39)
  const payment = out.held ? await captureHeldPaymentQuietly(orderId, userId) : null;
  return {
    id: out.edit.id, order_id: orderId, edited_at: out.edit.edited_at,
    lines: out.plan.map(({ order_item_id, product_name, from_qty, to_qty }) => ({ order_item_id, product_name, from_qty, to_qty })),
    credit_notes: out.creditNotes.map((c) => c.credit_note_number),
    refund_paise: out.refundPaise, refund_status: out.status, refunds: out.refundLegs,
    message: messageFor(out.status, out.refundPaise),
    payment,
  };
}

function messageFor(status: string, paise: number): string {
  const amount = `₹${(paise / 100).toFixed(2)}`;
  if (status === 'recorded') return `Your order is changed. ${amount} is being refunded the way you paid.`;
  if (status === 'after_capture') return `Your order is changed. ${amount} less will be charged: the held amount is taken after the pharmacist's check and ${amount} is refunded straight away.`;
  return 'Your order is changed.';
}
