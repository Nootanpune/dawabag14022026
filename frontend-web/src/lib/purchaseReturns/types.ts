// Shapes returned by /api/v1/purchasing/returns (purchase returns to suppliers, C-28).
// Money is paise; bigint sums may arrive as strings, so display goes through formatPaise.
import type { Paise } from '../purchasing/types';

export const RETURN_STATUSES = ['requested', 'approved', 'dispatched', 'settled', 'rejected'] as const;
export type PurchaseReturnStatus = (typeof RETURN_STATUSES)[number];

export const PURCHASE_RETURN_REASONS = ['recalled', 'expired', 'near_expiry', 'damaged', 'excess', 'wrong_item'] as const;
export type PurchaseReturnReason = (typeof PURCHASE_RETURN_REASONS)[number];

export interface PurchaseReturnRow {
  id: string;
  return_no: string;
  vendor_id: string;
  supplier_name: string;
  supplier_gstin: string | null;
  reason: PurchaseReturnReason;
  status: PurchaseReturnStatus;
  notes: string;
  taxable_paise: Paise;
  cgst_paise: Paise;
  sgst_paise: Paise;
  igst_paise: Paise;
  total_paise: Paise;
  created_at: string;
  decided_at: string | null;
  decision_notes: string | null;
  dispatched_at: string | null;
  dispatch_reference: string | null;
  supplier_credit_note_no: string | null;
  supplier_credit_note_date: string | null;
  supplier_credit_paise: Paise | null;
  settled_at: string | null;
  requested_by: string;
  requested_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
}

export interface PurchaseReturnLine {
  id: string;
  batch_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_cost_paise: number;
  gst_rate: number;
  taxable_paise: Paise;
  gst_paise: Paise;
  /** stock adjustment written when the return was approved (C-46) */
  adjustment_no: string | null;
}

export interface PurchaseReturn extends PurchaseReturnRow {
  lines: PurchaseReturnLine[];
}

export interface NewPurchaseReturn {
  vendor_id: string;
  reason: PurchaseReturnReason;
  notes: string;
  lines: { batch_id: string; quantity: number }[];
}

export interface SupplierCreditNote {
  supplier_credit_note_no: string;
  supplier_credit_note_date: string; // YYYY-MM-DD
  supplier_credit_paise: number;
}
