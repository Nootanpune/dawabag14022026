// Changing an order before packing (Sprint 43, URS-074) — pure rules, unit-tested in rules.test.ts.
//
// Owner-facing summary (DECISIONS 2026-10-03 "Buyers can lower quantities or remove lines
// before packing"):
//   • The buyer may LOWER a quantity or REMOVE a line while none of the order's parcels is
//     packed (every shipment still 'pending'). Adding medicines or raising a quantity is not
//     an edit: the buyer places a new order (deferred — it would need a new seller choice,
//     invoice, prescription check and a second payment).
//   • The tax invoice issued at placement stays as it is (amounts final, C-30; sale identity
//     fixed, Sprint 42). What comes off gets a CREDIT NOTE in the seller's series; the parcel
//     is packed for what is left (supply_qty).
//   • Money: the buyer gets back their share of the credit note (after any order discount;
//     the delivery charge is unchanged). Paid by card / UPI / wallet / credit bill → refunded
//     now through the refund ledger. Only AUTHORISED (prescription order before the
//     pharmacist's check, Sprint 39) → Razorpay can only capture the authorised amount in
//     full, so the difference is refunded straight after the capture; if the order is then
//     not supplied, the hold is released and nothing is charged.
//   • Less of a medicine never needs a new prescription; the pharmacist's release stands.
// No database imports here.

/** Order states in which the buyer may still change the order (shipments decide the rest). */
export const EDITABLE_ORDER_STATES = ['confirmed', 'rx_pending', 'rx_verified', 'packing'] as const;

export interface EditLineState {
  order_item_id: string;
  product_name: string;
  quantity: number;        // as invoiced
  supply_qty: number;      // still to be supplied (after earlier changes)
  min_qty: number;         // the buyer type's minimum per line (trade buyers), else 1
}

export interface EditRequestLine { order_item_id: string; quantity: number }

export interface PlannedChange { order_item_id: string; product_name: string; from_qty: number; to_qty: number; removed: number }

export class EditRefused extends Error {
  constructor(message: string, public code: string, public status = 409) { super(message); }
}

/** Why this order cannot be changed now, or null when it can. */
export function editBlockReason(order: { status: string; payment_terms?: string | null }, shipments: { status: string }[]): string | null {
  if (order.status === 'pending_payment' || order.status === 'payment_failed') {
    return 'This order is not paid yet. Pay for it, or cancel it and place a new one.';
  }
  if (order.status === 'cancelled') return 'This order is cancelled.';
  if (order.status === 'rx_rejected') return 'Your prescription needs attention first. Send a new prescription or cancel the order.';
  const open = shipments.filter((s) => s.status !== 'cancelled');
  if (open.some((s) => s.status === 'packed')) {
    return 'Packing has started, so the order can no longer be changed. You can return items after delivery if they qualify.';
  }
  if (!(EDITABLE_ORDER_STATES as readonly string[]).includes(order.status) || !open.length || open.some((s) => s.status !== 'pending')) {
    return 'This order can no longer be changed. You can return items after delivery if they qualify.';
  }
  return null;
}

/**
 * The change for each requested line. Only lower quantities (0 = remove the line); at least one
 * unit must stay on the order (to remove everything, cancel it).
 */
export function planEdit(lines: EditLineState[], req: EditRequestLine[]): PlannedChange[] {
  if (!req.length) throw new EditRefused('Choose what to change', 'ORDER_EDIT_EMPTY', 400);
  const byId = new Map(lines.map((l) => [l.order_item_id, l]));
  const seen = new Set<string>();
  const out: PlannedChange[] = [];
  for (const r of req) {
    if (seen.has(r.order_item_id)) throw new EditRefused('Each item may be listed only once', 'ORDER_EDIT_DUPLICATE', 400);
    seen.add(r.order_item_id);
    const l = byId.get(r.order_item_id);
    if (!l) throw new EditRefused('That item is not on this order', 'ORDER_EDIT_UNKNOWN_LINE', 400);
    if (!Number.isInteger(r.quantity) || r.quantity < 0) throw new EditRefused('Quantities must be whole numbers', 'ORDER_EDIT_BAD_QUANTITY', 400);
    if (r.quantity > l.supply_qty) {
      throw new EditRefused(`To get more ${l.product_name}, place a new order — an order can only be lowered once it is placed.`,
        'ORDER_EDIT_INCREASE_NOT_SUPPORTED', 422);
    }
    if (r.quantity === l.supply_qty) continue;
    if (r.quantity > 0 && r.quantity < l.min_qty) {
      throw new EditRefused(`The minimum for ${l.product_name} is ${l.min_qty}; remove it instead or keep at least ${l.min_qty}.`,
        'ORDER_EDIT_BELOW_MINIMUM', 400);
    }
    out.push({ order_item_id: l.order_item_id, product_name: l.product_name, from_qty: l.supply_qty, to_qty: r.quantity, removed: l.supply_qty - r.quantity });
  }
  if (!out.length) throw new EditRefused('Nothing changed', 'ORDER_EDIT_NO_CHANGE', 400);
  const left = lines.reduce((s, l) => {
    const c = out.find((x) => x.order_item_id === l.order_item_id);
    return s + (c ? c.to_qty : l.supply_qty);
  }, 0);
  if (left <= 0) throw new EditRefused('To remove everything, cancel the order instead.', 'ORDER_EDIT_WOULD_EMPTY', 409);
  return out;
}

/** The buyer's share of a credit note: invoice value less their share of the order discount (as returns). */
export function buyerShare(creditTotalPaise: number, order: { subtotal_paise: number; gst_paise: number; discount_paise: number }): number {
  const goods = Number(order.subtotal_paise) + Number(order.gst_paise);
  if (goods <= 0) return 0;
  return Math.max(0, Math.round(creditTotalPaise * (goods - Number(order.discount_paise || 0)) / goods));
}

export type EditRefundStatus = 'none' | 'recorded' | 'after_capture' | 'not_needed';

/** How the money for a change is handled, from how the order is paid. */
export function refundTiming(p: { paymentTerms: string; heldPayment: boolean }): 'now' | 'after_capture' {
  if (p.paymentTerms !== 'prepaid') return 'now';       // credit bill reduced
  return p.heldPayment ? 'after_capture' : 'now';
}
