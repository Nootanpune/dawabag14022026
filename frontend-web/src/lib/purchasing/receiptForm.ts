// Goods-receipt form model: the user types rupees and dates as strings; we turn
// them into the API body (paise, integers). The server re-checks everything —
// shelf life, PO quantities, printed MRP ≥ selling prices (C-16), recalls (C-28).
import { rupeesToPaise } from '../admin/format';
import type { NewReceipt, NewReceiptLine, PurchaseOrder } from './types';
import { todayIST } from '@/lib/dates';

export interface ReceiptLineDraft {
  key: string;
  po_item_id?: string;
  product_id: string;
  product_name: string;
  sku: string;
  /** units still due on the PO line (shown as a hint only) */
  remaining?: number;
  batch_number: string;
  expiry_date: string;
  manufactured_date: string;
  quantity: string;
  free_quantity: string;
  unit_cost: string;
  mrp: string;
}

export interface ReceiptHeaderDraft {
  vendor_id: string;
  supplier_invoice_no: string;
  supplier_invoice_date: string;
  notes: string;
}

let seq = 0;
export const newLineKey = () => `l${++seq}`;

export function blankLine(p: { id: string; name: string; sku: string }): ReceiptLineDraft {
  return {
    key: newLineKey(),
    product_id: p.id,
    product_name: p.name,
    sku: p.sku,
    batch_number: '',
    expiry_date: '',
    manufactured_date: '',
    quantity: '',
    free_quantity: '',
    unit_cost: '',
    mrp: '',
  };
}

/** One line per PO item that still has units due, quantity prefilled with what remains. */
export function linesFromPo(po: PurchaseOrder): ReceiptLineDraft[] {
  return po.items
    .filter((i) => i.quantity - i.received_qty > 0)
    .map((i) => ({
      ...blankLine({ id: i.product_id, name: i.product_name, sku: i.sku }),
      po_item_id: i.id,
      remaining: i.quantity - i.received_qty,
      quantity: String(i.quantity - i.received_qty),
      unit_cost: (i.unit_cost_paise / 100).toFixed(2),
    }));
}

/** Second batch of the same PO line (one PO item can arrive in several batches). */
export function splitLine(l: ReceiptLineDraft): ReceiptLineDraft {
  return { ...l, key: newLineKey(), batch_number: '', expiry_date: '', manufactured_date: '', quantity: '', free_quantity: '' };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const posInt = (s: string) => /^\d+$/.test(s.trim()) && Number(s) > 0;

/** Quick client checks; returns problems per line ("Line 2: …") or [] when the body can be sent. */
export function receiptProblems(h: ReceiptHeaderDraft, lines: ReceiptLineDraft[]): string[] {
  const out: string[] = [];
  const today = todayIST();
  if (!h.vendor_id) out.push('Choose the supplier');
  if (!h.supplier_invoice_no.trim()) out.push("Enter the supplier's invoice number");
  if (!DATE.test(h.supplier_invoice_date)) out.push("Enter the supplier's invoice date");
  else if (h.supplier_invoice_date > today) out.push('Supplier invoice date cannot be in the future');
  if (!lines.length) out.push('Add at least one line');
  lines.forEach((l, i) => {
    const at = `Line ${i + 1} (${l.product_name})`;
    if (!l.batch_number.trim()) out.push(`${at}: batch number is required`);
    if (!DATE.test(l.expiry_date)) out.push(`${at}: expiry date is required`);
    else if (l.expiry_date <= today) out.push(`${at}: batch has already expired`);
    if (l.manufactured_date && l.manufactured_date > today) out.push(`${at}: manufacturing date is in the future`);
    if (!posInt(l.quantity)) out.push(`${at}: quantity must be a whole number above 0`);
    if (l.free_quantity && !/^\d+$/.test(l.free_quantity.trim())) out.push(`${at}: free quantity must be a whole number`);
    else if (posInt(l.quantity) && Number(l.free_quantity || 0) > Number(l.quantity))
      out.push(`${at}: free quantity cannot be more than the paid quantity`);
    if (rupeesToPaise(l.unit_cost) == null || !l.unit_cost.trim()) out.push(`${at}: enter the unit cost`);
    const mrp = rupeesToPaise(l.mrp);
    if (!mrp) out.push(`${at}: enter the MRP printed on the pack`);
  });
  return out;
}

export function receiptBody(h: ReceiptHeaderDraft, lines: ReceiptLineDraft[], poId?: string): NewReceipt {
  return {
    vendor_id: h.vendor_id,
    ...(poId && { po_id: poId }),
    supplier_invoice_no: h.supplier_invoice_no.trim(),
    supplier_invoice_date: h.supplier_invoice_date,
    ...(h.notes.trim() && { notes: h.notes.trim() }),
    lines: lines.map(
      (l): NewReceiptLine => ({
        ...(l.po_item_id && { po_item_id: l.po_item_id }),
        product_id: l.product_id,
        batch_number: l.batch_number.trim(),
        expiry_date: l.expiry_date,
        ...(l.manufactured_date && { manufactured_date: l.manufactured_date }),
        quantity: Number(l.quantity),
        ...(l.free_quantity.trim() && { free_quantity: Number(l.free_quantity) }),
        unit_cost_paise: rupeesToPaise(l.unit_cost) ?? 0,
        printed_mrp_paise: rupeesToPaise(l.mrp) ?? 0,
      })
    ),
  };
}

/** The server's 422 joins every line problem with '; ' — split it back into a list. */
export function splitServerProblems(message: string): string[] {
  return message.split('; ').map((s) => s.trim()).filter(Boolean);
}
