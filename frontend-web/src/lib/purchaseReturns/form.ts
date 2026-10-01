// Purchase-return form model: the user ticks batches and types quantities as strings;
// we check the obvious things and build the API body. The server re-checks free stock
// and that each batch came from this supplier (C-28).
import type { Batch } from '../stock/types';
import { freeQty } from './labels';
import type { NewPurchaseReturn, PurchaseReturnReason } from './types';

export interface ReturnDraft {
  vendor_id: string;
  reason: PurchaseReturnReason | '';
  notes: string;
  /** batch_id → quantity typed */
  qty: Record<string, string>;
}

export const emptyReturnDraft = (): ReturnDraft => ({ vendor_id: '', reason: '', notes: '', qty: {} });

/** Batches ticked on the form, in the order shown. */
export function pickedBatches(d: ReturnDraft, batches: Batch[]): Batch[] {
  return batches.filter((b) => b.id in d.qty);
}

/** Cost value of the units typed (ex-GST; the server adds GST). */
export function draftCostPaise(d: ReturnDraft, batches: Batch[]): number {
  return pickedBatches(d, batches).reduce((s, b) => {
    const q = Number(d.qty[b.id]);
    return s + (Number.isInteger(q) && q > 0 ? q * (b.purchase_price_paise ?? 0) : 0);
  }, 0);
}

export function returnProblems(d: ReturnDraft, batches: Batch[]): string[] {
  const out: string[] = [];
  if (!d.vendor_id) out.push('Choose the supplier');
  if (!d.reason) out.push('Choose the reason for the return');
  const n = d.notes.trim().length;
  if (n < 3 || n > 1000) out.push('Notes must be 3–1000 characters');
  const picked = pickedBatches(d, batches);
  if (!picked.length) out.push('Tick at least one batch');
  picked.forEach((b, i) => {
    const raw = (d.qty[b.id] ?? '').trim();
    const q = Number(raw);
    const at = `Line ${i + 1} (${b.product_name} batch ${b.batch_number})`;
    if (!/^\d+$/.test(raw) || q <= 0) out.push(`${at}: quantity must be a whole number above 0`);
    else if (q > freeQty(b)) out.push(`${at}: only ${freeQty(b)} unit(s) are free to return`);
  });
  return out;
}

export function returnBody(d: ReturnDraft, batches: Batch[]): NewPurchaseReturn {
  return {
    vendor_id: d.vendor_id,
    reason: d.reason as PurchaseReturnReason,
    notes: d.notes.trim(),
    lines: pickedBatches(d, batches).map((b) => ({ batch_id: b.id, quantity: Number(d.qty[b.id]) })),
  };
}
