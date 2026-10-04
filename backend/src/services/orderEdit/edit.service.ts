// Changing an order before the pharmacist's approval (Sprint 44, owner decision CONFIRMED
// 2026-10-03; rules and wording in rules.ts). One transaction under the order lock (the same
// lock a cancellation and a held-payment capture take):
//   lines lowered / removed / raised / added (lines.ts; allocation again for more units),
//   shipment amounts re-priced (no invoice exists yet — none is touched, no credit note),
//   a prescription for new prescription medicines (prescription.ts, C-08) and a signed written
//   order for a doctor / institution's additions (Drugs Rules r.65(9)(b)), the order re-priced
//   and the money settled (money.ts: refund now / after the capture, second payment, or the
//   credit bill), the change kept in order_edits and the audit log (C-46).
import { randomUUID } from 'crypto';
import { query, withTransactionRetry } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { BuyerType, effectiveCustomerType } from '../../utils/customerType';
import { rxRequiredLines } from '../rxGate.service';
import { recordRefund, refundableAmount, sendGatewayRefunds } from '../refund.service';
import { captureHeldPaymentQuietly, needsManualCapture } from '../payments/rxHold/hold.service';
import { assertRxSalesOpen } from '../emergencyStop/state.service';
import { saleKindFor } from '../stock/sellingRights';
import { repriceShipmentsTx } from '../shipment.service';
import { assertQuantity, pricedLine, sellableProduct, SellableProduct } from '../orderLines/pricing';
import { PRACTITIONER_TYPE } from '../practitionerSales/rules';
import { assertMaySellToPractitioner } from '../practitionerSales/registration.service';
import { buyerStanding, type Standing } from '../buyerRestriction/standing.service';
import { attachWrittenOrderTx } from '../practitionerSales/writtenOrder.service';
import { queueNotification } from '../notification.service';
import {
  AddRequest, EditRefused, EditRequestLine, MoneyAction, editBlockReason, editMessage, moneyAction, planEdit, productTotals,
} from './rules';
import { OrderLine, addLinesTx, lowerLineTx, orderLinesTx, raiseLineTx } from './lines';
import { OrderMoneyRow, adjustCreditBillTx, committedPaise, repriceOrderTx, valueOf } from './money';
import { prescriptionForEditTx } from './prescription';

export interface EditInput {
  lines?: EditRequestLine[];
  add?: AddRequest[];
  prescription_id?: string;
  written_order_id?: string;
  reason?: string;
}

/** For the order page: may the buyer change it now, the changes made so far, and any difference to pay. */
export async function orderEditState(order: { id: string; status: string; payment_terms?: string | null },
  shipments: { status: string; invoice_number?: string | null; pharmacist_check?: string | null }[]) {
  const rxChecked = (await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM order_items WHERE order_id = $1 AND prescription_id IS NOT NULL`, [order.id]))[0]?.n > 0;
  const reason = editBlockReason(order, shipments, { rxChecked });
  const edits = await query<any>(
    `SELECT e.id, e.edited_at, e.stage, e.lines, e.credit_notes, e.refund_paise, e.refund_status, e.refund_recorded_at,
            e.value_before_paise, e.value_after_paise, e.extra_paise, e.extra_status, e.sent_to_pharmacist
     FROM order_edits e WHERE e.order_id = $1 ORDER BY e.edited_at`, [order.id]);
  const due = edits.find((e) => e.extra_status === 'awaiting_payment');
  return { can_edit: reason === null, edit_block_reason: reason, edits,
    extra_payment: due ? { order_edit_id: due.id, amount_paise: Number(due.extra_paise), status: due.extra_status } : null };
}

interface PlannedAdd { product: SellableProduct; quantity: number }

export async function editOrder(userId: string, orderId: string, input: EditInput) {
  const reqLines = input.lines ?? [];
  const reqAdds = input.add ?? [];
  const out = await withTransactionRetry(async (client) => {
    // Order first (the lock a cancellation and a held capture take), then its shipments
    const o = (await client.query(
      `SELECT o.id, o.user_id, o.order_number, o.status, o.payment_terms, o.subtotal_paise, o.gst_paise, o.discount_paise, o.shipping_paise,
              o.wallet_used_paise, o.total_paise, o.placed_subtotal_paise, o.placed_gst_paise, o.placed_discount_paise, o.credit_settled_at,
              o.pricing_type, a.pincode, u.customer_type, u.kyc_status
       FROM orders o JOIN users u ON u.id = o.user_id JOIN addresses a ON a.id = o.address_id
       WHERE o.id = $1 AND o.user_id = $2 AND o.deleted_at IS NULL FOR UPDATE OF o`, [orderId, userId])).rows[0];
    if (!o) throw new AppError('Order not found', 404);
    const shipments = (await client.query(
      `SELECT id, status, seller_type, partner_id, invoice_number, pharmacist_check FROM order_shipments WHERE order_id = $1 ORDER BY id FOR UPDATE`,
      [orderId])).rows;
    const rxChecked = (await client.query(`SELECT 1 FROM order_items WHERE order_id = $1 AND prescription_id IS NOT NULL LIMIT 1`, [orderId])).rows.length > 0;
    const blocked = editBlockReason(o, shipments, { rxChecked });
    if (blocked) throw new AppError(blocked, 409, true, 'ORDER_NOT_EDITABLE');

    const buyerType = (o.pricing_type || effectiveCustomerType(o.customer_type, o.kyc_status)) as BuyerType;
    const lines = await orderLinesTx(client, orderId);
    const products = new Map<string, SellableProduct>();
    // Sprint 47: more of a medicine or a new one only if this buyer may buy it now (403 BUYER_RESTRICTED)
    let standing: Standing | null = null;
    const productOf = async (id: string) => {
      standing ??= await buyerStanding(client, { id: userId, customer_type: o.customer_type, kyc_status: o.kyc_status });
      if (!products.has(id)) products.set(id, await sellableProduct(client, id, buyerType, standing));
      return products.get(id)!;
    };
    // Minimum per line: the trade buyer type's minimum (Sprint 43), otherwise 1
    const minCol = buyerType === 'b2b_retailer' ? 'COALESCE(min_order_qty_retailer, 1)'
      : buyerType === 'b2b_wholesaler' ? 'COALESCE(min_order_qty_wholesaler, 10)' : '1';
    const mins = new Map((await client.query(`SELECT id, ${minCol}::int AS m FROM products WHERE id = ANY($1::uuid[])`,
      [lines.map((l) => l.product_id)])).rows.map((r: any) => [r.id, Number(r.m)]));
    const state = lines.map((l) => ({ order_item_id: l.order_item_id, product_id: l.product_id, product_name: l.product_name,
      supply_qty: l.supply_qty, min_qty: mins.get(l.product_id) ?? 1 }));
    let plan;
    try {
      plan = planEdit(state, reqLines, reqAdds);
    } catch (e) {
      if (e instanceof EditRefused) throw new AppError(e.message, e.status, true, e.code);
      throw e;
    }
    const byId = new Map(lines.map((l) => [l.order_item_id, l]));

    // More of a medicine, or a new one: the same checks as at checkout (C-10, quantity limits)
    const adds: PlannedAdd[] = [];
    for (const a of reqAdds) {
      const p = await productOf(a.product_id);
      assertQuantity(p, a.quantity);
      adds.push({ product: p, quantity: a.quantity });
    }
    const totals = productTotals(state, plan, reqAdds);
    for (const c of plan.filter((x) => x.kind === 'raised')) assertQuantity(await productOf(c.product_id), totals.get(c.product_id) ?? c.to_qty);
    const more = [
      ...plan.filter((c) => c.kind === 'raised').map((c) => ({ product: products.get(c.product_id)!, name: c.product_name })),
      ...adds.map((a) => ({ product: a.product, name: a.product.name })),
    ];
    const newRx = more.filter((m) => m.product.needs_prescription);
    // Emergency stop (Sprint 38): no more prescription medicines while paused (C-08)
    if (newRx.length) {
      await assertRxSalesOpen(client, buyerType, newRx.map((m) => ({ name: m.name, drug_schedule: m.product.drug_schedule })));
    }
    // A doctor / institution adding anything: registration still good (r.65(9)(b)); written order below
    const practitioner = o.customer_type === PRACTITIONER_TYPE && buyerType === PRACTITIONER_TYPE;
    if (practitioner && more.length) await assertMaySellToPractitioner(client, userId);

    // Apply: less first (stock back), then more (allocated again), then new medicines
    const touched = new Set<string>();
    const ctx = { pincode: o.pincode, saleKind: saleKindFor(buyerType), orderValuePaise: valueOf(o) };
    for (const c of plan.filter((x) => x.kind !== 'raised')) {
      const l = byId.get(c.order_item_id)!;
      touched.add(l.shipment_id);
      await lowerLineTx(client, orderId, l, c.to_qty);
    }
    for (const c of plan.filter((x) => x.kind === 'raised')) {
      const l = byId.get(c.order_item_id)!;
      for (const id of await raiseLineTx(client, orderId, l, c.to_qty, ctx)) touched.add(id);
    }
    const added = await addLinesTx(client, orderId, adds.map((a) => pricedLine(a.product, a.quantity)), ctx);
    for (const id of added.shipmentIds) touched.add(id);
    await repriceShipmentsTx(client, [...touched]);

    // A shipment the pharmacist had put on hold goes back to the check with the new contents
    await client.query(
      `UPDATE order_shipments SET pharmacist_check = 'pending', pharmacist_check_note = NULL, pharmacist_checked_by = NULL,
         pharmacist_checked_at = NULL, pharmacist_name = NULL, pharmacist_reg_no = NULL, vendor_pharmacist_id = NULL
       WHERE order_id = $1 AND pharmacist_check = 'held' AND invoice_number IS NULL`, [orderId]);

    // Prescription medicines added or raised: a valid prescription covering them, and back to
    // the pharmacist's prescription check (C-08)
    let prescription: Awaited<ReturnType<typeof prescriptionForEditTx>> | null = null;
    let status = o.status as string;
    if (newRx.length) {
      prescription = await prescriptionForEditTx(client, userId, orderId, input.prescription_id, newRx.map((m) => m.name));
      if (status === 'confirmed' || status === 'packing') {
        await client.query(`UPDATE orders SET status = 'rx_pending', updated_at = NOW() WHERE id = $1`, [orderId]);
        status = 'rx_pending';
      }
    } else if (status === 'rx_pending' && !(await rxRequiredLines(client, orderId)).some((l) => !l.prescription_id)) {
      // The last prescription medicine came off: nothing left for the prescription check (C-08)
      await client.query(`UPDATE orders SET status = 'packing', updated_at = NOW() WHERE id = $1 AND status = 'rx_pending'`, [orderId]);
      status = 'packing';
    }

    // Money (money.ts): re-price the order; the difference against what the buyer has paid
    const money = o as OrderMoneyRow;
    const before = valueOf(money);
    const after = await repriceOrderTx(client, money);
    const committed = await committedPaise(client, money);
    const held = (await client.query(`SELECT 1 FROM payments WHERE order_id = $1 AND status = 'authorized'`, [orderId])).rows.length > 0;
    const diff = money.payment_terms === 'prepaid'
      ? after.value - committed
      : Math.max(0, after.value - Number(money.wallet_used_paise)) - Number(money.total_paise);
    const action: MoneyAction = moneyAction({ paymentTerms: money.payment_terms, heldPayment: held, diff, creditSettled: !!money.credit_settled_at });
    const newTotal = money.payment_terms === 'prepaid'
      ? Math.max(0, after.value - Number(money.wallet_used_paise))
      : Number(money.total_paise) + (action.kind === 'credit_bill' ? action.delta : 0);
    await client.query(
      `UPDATE orders SET subtotal_paise = $2, gst_paise = $3, discount_paise = $4, total_paise = $5, updated_at = NOW() WHERE id = $1`,
      [orderId, after.subtotal, after.gst, after.discount, newTotal]);
    if (action.kind === 'credit_bill') await adjustCreditBillTx(client, money, action.delta);
    // A difference still unpaid from an earlier change is replaced by this one's
    await client.query(`UPDATE order_edits SET extra_status = 'superseded' WHERE order_id = $1 AND extra_status = 'awaiting_payment'`, [orderId]);

    let refundPaise = 0, refundStatus = 'none', extraPaise = 0, extraStatus = 'none';
    let refundIds: string[] = [];
    let refundLegs: any[] = [];
    if (action.kind === 'refund' && action.timing === 'now') {
      refundPaise = Math.min(action.amount, await refundableAmount(client, orderId));
      const r = await recordRefund(client, { orderId, amountPaise: refundPaise, source: 'order_edit', userId });
      refundIds = r.gatewayRefundIds; refundLegs = r.legs;
      refundStatus = refundPaise > 0 ? 'recorded' : 'none';
    } else if (action.kind === 'refund') {
      refundPaise = action.amount; refundStatus = 'after_capture';
    } else if (action.kind === 'credit_bill') {
      if (action.delta < 0) { refundPaise = -action.delta; refundStatus = 'credit_bill'; }
      else { extraPaise = action.delta; extraStatus = 'on_credit_bill'; }
    } else if (action.kind === 'extra') {
      extraPaise = action.amount; extraStatus = 'awaiting_payment';
    }

    const record = [
      ...plan.map(({ order_item_id, product_id, product_name, from_qty, to_qty, kind }) => ({ order_item_id, product_id, product_name, from_qty, to_qty, kind,
        needs_prescription: !!products.get(product_id)?.needs_prescription && kind === 'raised' })),
      ...adds.map((a) => ({ order_item_id: null, product_id: a.product.id, product_name: a.product.name, from_qty: 0, to_qty: a.quantity, kind: 'added',
        needs_prescription: a.product.needs_prescription })),
    ];
    // A doctor / institution's additions need a signed written order (Drugs Rules r.65(9)(b));
    // linked to this change (the change row follows in this transaction: deferred key)
    const editId = randomUUID();
    let writtenOrder: { id: string; kind: string } | null = null;
    if (practitioner && more.length) {
      writtenOrder = await attachWrittenOrderTx(client, userId, input.written_order_id, { orderId, orderEditId: editId,
        lines: [...plan.filter((c) => c.kind === 'raised').map((c) => ({ product_id: c.product_id, product_name: c.product_name, quantity: c.to_qty })),
          ...adds.map((a) => ({ product_id: a.product.id, product_name: a.product.name, quantity: a.quantity }))] });
    }
    const edit = (await client.query(
      `INSERT INTO order_edits (id, order_id, edited_by, lines, credit_notes, refund_paise, refund_status, refund_recorded_at, stage,
         value_before_paise, value_after_paise, extra_paise, extra_status, prescription_id, sent_to_pharmacist, written_order_id)
       VALUES ($12, $1, $2, $3, '[]'::jsonb, $4, $5::varchar, CASE WHEN $5::varchar = 'recorded' THEN NOW() END, 'before_invoice',
               $6, $7, $8, $9, $10, $11, $13)
       RETURNING id, edited_at`,
      [orderId, userId, JSON.stringify(record), refundPaise, refundStatus, before, after.value, extraPaise, extraStatus,
       prescription?.id ?? null, newRx.length > 0, editId, writtenOrder?.id ?? null])).rows[0];
    await writeAuditTx(client, { userId: o.user_id, action: 'order_edited', performedBy: userId,
      newValue: { order_id: orderId, order_number: o.order_number, edit_id: edit.id, stage: 'before_invoice', lines: record,
        value_before_paise: before, value_after_paise: after.value, money: action, prescription_id: prescription?.id ?? null,
        written_order_id: writtenOrder?.id ?? null }, notes: input.reason?.slice(0, 500) });
    const manual = action.kind === 'extra' ? await needsManualCapture(client, orderId) : false;
    return { edit, record, action, refundPaise, refundStatus, extraPaise, extraStatus, refundIds, refundLegs, held, status, prescription,
      writtenOrder, manual, rxCheck: newRx.length > 0, userIdOfOrder: o.user_id, orderNumber: o.order_number };
  });

  await sendGatewayRefunds(out.refundIds);
  // Removing the last prescription line may make a held payment ready for capture (Sprint 39)
  const payment = out.held ? await captureHeldPaymentQuietly(orderId, userId) : null;
  if (out.extraStatus === 'awaiting_payment') {
    await queueNotification({ userId: out.userIdOfOrder, type: 'order_status', status: 'payment_due', orderId, orderNumber: out.orderNumber }).catch(() => undefined);
  }
  return {
    id: out.edit.id, order_id: orderId, edited_at: out.edit.edited_at, stage: 'before_invoice',
    lines: out.record,
    credit_notes: [] as string[],
    refund_paise: out.refundPaise, refund_status: out.refundStatus, refunds: out.refundLegs,
    extra_paise: out.extraPaise, extra_status: out.extraStatus,
    // Sprint 44: the second payment for the difference — POST /payments/create-order {order_id, order_edit_id}
    extra_payment: out.extraStatus === 'awaiting_payment'
      ? { order_edit_id: out.edit.id, amount_paise: out.extraPaise, capture: out.manual ? 'after_pharmacist_check' : 'now' } : null,
    order_status: out.status,
    prescription: out.prescription,
    written_order: out.writtenOrder,
    sent_to_pharmacist: out.rxCheck,
    message: editMessage(out.action, { rxCheck: out.rxCheck, manualCapture: out.manual }),
    payment,
  };
}
