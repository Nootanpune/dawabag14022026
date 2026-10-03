// Changing an order before the pharmacist's approval — pure rules (Sprint 44, replaces the
// Sprint 43 proposal). Unit-tested in rules.test.ts; no database imports.
//
// Owner decision CONFIRMED 2026-10-03: "Once the invoice is issued, orders cannot be changed.
// The order can only be changed/edited before the pharmacist's approval; any new prescription
// drug added requires a valid prescription."
//   • The tax invoice is issued when the pharmacist approves (releases) a shipment (Sprint 44,
//     migration 39). Until no shipment is approved, no prescription on the order has been
//     checked and nothing is invoiced, the buyer may lower, remove or RAISE a quantity and ADD
//     medicines (OTC and prescription). After that: no change (409 ORDER_NOT_EDITABLE) —
//     cancel, or return after delivery.
//   • Nothing is invoiced yet, so a change rewrites the order's lines and amounts: no credit
//     note (credit notes stay for returns / cancellations after the invoice, C-30).
//   • A new or raised prescription medicine needs a valid prescription covering it (C-08) and
//     sends the order back to the pharmacist's prescription check. A doctor / institution
//     buyer adds a signed written order for what is added (Drugs Rules r.65(9)(b)).
//   • Raised and added lines are allocated again (the seller may differ → another shipment).
//   • Money: the order is re-priced (a coupon discount shrinks in proportion when the order
//     shrinks below what was placed, never grows; the delivery charge never changes). The
//     difference against what the buyer has paid: less → refunded now, or right after the
//     capture when the payment is only authorised (Razorpay captures the authorised amount in
//     full — no partial capture); more → a second payment for the difference (authorised the
//     same way when the order holds prescription medicines). The pharmacist cannot approve
//     the order until that payment is made. Trade buyers on credit: the credit bill changes.

/** Order states in which the buyer may still change the order (shipments and prescriptions decide the rest). */
export const EDITABLE_ORDER_STATES = ['confirmed', 'rx_pending', 'packing'] as const;

export const INVOICE_ISSUED_MESSAGE = 'The invoice has been issued; you can cancel or return instead.';

export interface EditOrderState { status: string; payment_terms?: string | null }
export interface EditShipmentState { status: string; invoice_number?: string | null; pharmacist_check?: string | null }

/** Why this order cannot be changed now, or null when it can. */
export function editBlockReason(order: EditOrderState, shipments: EditShipmentState[], opts: { rxChecked?: boolean } = {}): string | null {
  if (order.status === 'pending_payment' || order.status === 'payment_failed') {
    return 'This order is not paid yet. Pay for it, or cancel it and place a new one.';
  }
  if (order.status === 'cancelled') return 'This order is cancelled.';
  if (order.status === 'rx_rejected') return 'Your prescription needs attention first. Send a new prescription or cancel the order.';
  if (shipments.some((s) => !!s.invoice_number)) return INVOICE_ISSUED_MESSAGE;
  if (shipments.some((s) => ['released', 'rejected', 'not_recorded'].includes(String(s.pharmacist_check)))) {
    return 'Our pharmacist has already approved this order, so it can no longer be changed. You can cancel it, or return items after delivery if they qualify.';
  }
  if (order.status === 'rx_verified' || opts.rxChecked) {
    return 'Our pharmacist has already checked the prescription for this order, so it can no longer be changed. You can cancel it, or return items after delivery if they qualify.';
  }
  const open = shipments.filter((s) => s.status !== 'cancelled');
  if (open.some((s) => s.status !== 'pending')) {
    return 'Packing has started, so the order can no longer be changed. You can return items after delivery if they qualify.';
  }
  if (!(EDITABLE_ORDER_STATES as readonly string[]).includes(order.status) || !open.length) {
    return 'This order can no longer be changed. You can return items after delivery if they qualify.';
  }
  return null;
}

export interface EditLineState {
  order_item_id: string;
  product_id: string;
  product_name: string;
  /** what is to be supplied now */
  supply_qty: number;
  /** the buyer type's minimum per line (trade buyers), else 1 */
  min_qty: number;
}

export interface EditRequestLine { order_item_id: string; quantity: number }
export interface AddRequest { product_id: string; quantity: number }

export type ChangeKind = 'lowered' | 'removed' | 'raised';
export interface PlannedChange { order_item_id: string; product_id: string; product_name: string; from_qty: number; to_qty: number; kind: ChangeKind }

export class EditRefused extends Error {
  constructor(message: string, public code: string, public status = 409) { super(message); }
}

/**
 * The change for each requested existing line (0 removes it; more raises it) and the
 * products to add. At least one unit must stay on the order (to remove everything, cancel).
 */
export function planEdit(lines: EditLineState[], req: EditRequestLine[], adds: AddRequest[] = []): PlannedChange[] {
  if (!req.length && !adds.length) throw new EditRefused('Choose what to change', 'ORDER_EDIT_EMPTY', 400);
  const byId = new Map(lines.map((l) => [l.order_item_id, l]));
  const seen = new Set<string>();
  const out: PlannedChange[] = [];
  for (const r of req) {
    if (seen.has(r.order_item_id)) throw new EditRefused('Each item may be listed only once', 'ORDER_EDIT_DUPLICATE', 400);
    seen.add(r.order_item_id);
    const l = byId.get(r.order_item_id);
    if (!l) throw new EditRefused('That item is not on this order', 'ORDER_EDIT_UNKNOWN_LINE', 400);
    if (!Number.isInteger(r.quantity) || r.quantity < 0) throw new EditRefused('Quantities must be whole numbers', 'ORDER_EDIT_BAD_QUANTITY', 400);
    if (r.quantity === l.supply_qty) continue;
    if (r.quantity > 0 && r.quantity < l.min_qty) {
      throw new EditRefused(`The minimum for ${l.product_name} is ${l.min_qty}; remove it instead or keep at least ${l.min_qty}.`,
        'ORDER_EDIT_BELOW_MINIMUM', 400);
    }
    out.push({ order_item_id: l.order_item_id, product_id: l.product_id, product_name: l.product_name, from_qty: l.supply_qty, to_qty: r.quantity,
      kind: r.quantity === 0 ? 'removed' : r.quantity < l.supply_qty ? 'lowered' : 'raised' });
  }
  const addSeen = new Set<string>();
  for (const a of adds) {
    if (addSeen.has(a.product_id)) throw new EditRefused('Each medicine may be added only once', 'ORDER_EDIT_DUPLICATE', 400);
    addSeen.add(a.product_id);
    if (!Number.isInteger(a.quantity) || a.quantity < 1) throw new EditRefused('Quantities must be whole numbers of at least 1', 'ORDER_EDIT_BAD_QUANTITY', 400);
    const on = lines.find((l) => l.product_id === a.product_id && l.supply_qty > 0);
    if (on) throw new EditRefused(`${on.product_name} is already on this order; change its quantity instead.`, 'ORDER_EDIT_ALREADY_ON_ORDER', 400);
  }
  if (!out.length && !adds.length) throw new EditRefused('Nothing changed', 'ORDER_EDIT_NO_CHANGE', 400);
  const left = lines.reduce((s, l) => {
    const c = out.find((x) => x.order_item_id === l.order_item_id);
    return s + (c ? c.to_qty : l.supply_qty);
  }, 0) + adds.reduce((s, a) => s + a.quantity, 0);
  if (left <= 0) throw new EditRefused('To remove everything, cancel the order instead.', 'ORDER_EDIT_WOULD_EMPTY', 409);
  return out;
}

/** Units of each product after the change (lines of one product may sit on several shipments). */
export function productTotals(lines: EditLineState[], changes: PlannedChange[], adds: AddRequest[]): Map<string, number> {
  const t = new Map<string, number>();
  for (const l of lines) {
    const c = changes.find((x) => x.order_item_id === l.order_item_id);
    t.set(l.product_id, (t.get(l.product_id) ?? 0) + (c ? c.to_qty : l.supply_qty));
  }
  for (const a of adds) t.set(a.product_id, (t.get(a.product_id) ?? 0) + a.quantity);
  return t;
}

/** The coupon discount after re-pricing: in proportion when the goods fall below what was placed; never more. */
export function repricedDiscount(placedDiscountPaise: number, placedGoodsPaise: number, goodsPaise: number): number {
  const d = Math.max(0, Number(placedDiscountPaise || 0));
  if (!d || goodsPaise >= placedGoodsPaise || placedGoodsPaise <= 0) return Math.min(d, Math.max(goodsPaise, 0));
  return Math.max(0, Math.round(d * goodsPaise / placedGoodsPaise));
}

export type MoneyAction =
  | { kind: 'none' }
  | { kind: 'refund'; amount: number; timing: 'now' | 'after_capture' }
  | { kind: 'extra'; amount: number }
  | { kind: 'credit_bill'; delta: number };

/**
 * What happens to the money: `diff` is the order's new value less what the buyer has paid
 * (or, on credit terms, the change in the credit bill).
 */
export function moneyAction(p: { paymentTerms: string; heldPayment: boolean; diff: number; creditSettled?: boolean }): MoneyAction {
  if (!p.diff) return { kind: 'none' };
  if (p.paymentTerms !== 'prepaid') {
    if (p.diff < 0 && p.creditSettled) return { kind: 'refund', amount: -p.diff, timing: 'now' };
    return { kind: 'credit_bill', delta: p.diff };
  }
  if (p.diff < 0) return { kind: 'refund', amount: -p.diff, timing: p.heldPayment ? 'after_capture' : 'now' };
  return { kind: 'extra', amount: p.diff };
}

/** The buyer's share of a credit note after any order discount (Sprint 43 edits after the invoice; returns). */
export function buyerShare(creditTotalPaise: number, order: { subtotal_paise: number; gst_paise: number; discount_paise: number }): number {
  const goods = Number(order.subtotal_paise) + Number(order.gst_paise);
  if (goods <= 0) return 0;
  return Math.max(0, Math.round(creditTotalPaise * (goods - Number(order.discount_paise || 0)) / goods));
}

export type EditRefundStatus = 'none' | 'recorded' | 'after_capture' | 'not_needed' | 'credit_bill';

/** How a refund for a change is handled, from how the order is paid (Sprint 43). */
export function refundTiming(p: { paymentTerms: string; heldPayment: boolean }): 'now' | 'after_capture' {
  if (p.paymentTerms !== 'prepaid') return 'now';       // credit bill reduced
  return p.heldPayment ? 'after_capture' : 'now';
}

/** The buyer-facing sentence for the result of a change. */
export function editMessage(a: MoneyAction, opts: { rxCheck: boolean; manualCapture?: boolean }): string {
  const rupees = (p: number) => `₹${(p / 100).toFixed(2)}`;
  const rx = opts.rxCheck ? ' Our pharmacist will check the prescription for what you added before the order is approved.' : '';
  switch (a.kind) {
    case 'refund':
      return a.timing === 'now'
        ? `Your order is changed. ${rupees(a.amount)} is being refunded the way you paid.${rx}`
        : `Your order is changed. ${rupees(a.amount)} less will be charged: the held amount is taken after the pharmacist's check and ${rupees(a.amount)} is refunded straight away.${rx}`;
    case 'extra':
      return `Your order is changed. Please pay the difference of ${rupees(a.amount)}${opts.manualCapture ? ' (held now, charged only after our pharmacist\'s check)' : ''}. `
        + `Our pharmacist approves the order once it is paid.${rx}`;
    case 'credit_bill':
      return a.delta > 0 ? `Your order is changed. ${rupees(a.delta)} is added to your credit bill.${rx}`
        : `Your order is changed. Your credit bill is lowered by ${rupees(-a.delta)}.${rx}`;
    default:
      return `Your order is changed.${rx}`;
  }
}
