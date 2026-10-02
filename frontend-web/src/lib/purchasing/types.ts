// Shapes returned by /api/v1/purchasing/*. Money is always paise (integers);
// bigint sums can arrive as strings, so display code goes through formatPaise.
export type Paise = number | string;

import type { LicenceBadgeData, LicenceBody, LicenceView } from '../licences/forms';

export interface Supplier extends LicenceBadgeData {
  id: string;
  name: string;
  drug_license_no: string | null;
  drug_license_expiry: string | null;
  gst_number: string | null;
  state: string | null;
  approval_status: string;
  is_active: boolean;
  /** approved, active and every licence unexpired (C-02) */
  can_supply: boolean;
  city?: string | null;
  /** every drug licence (Sprint 30): wholesale 20B/21B, manufacturing 25/28, … */
  licences: LicenceView[];
  licence_line: string | null;
}

export interface NewSupplier {
  name: string;
  licences: LicenceBody[];
  gst_number: string;
  state: string;
  city?: string;
  contact_name?: string;
  contact_mobile?: string;
  contact_email?: string;
}

export const PO_STATUSES = ['draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  status: PoStatus;
  total_amount_paise: Paise;
  gst_paise: Paise;
  expected_by: string | null;
  raised_at: string;
  supplier_name: string;
  lines: number;
  ordered_qty: number;
  received_qty: number;
}

export interface PoItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  received_qty: number;
  unit_cost_paise: number;
  gst_rate: number;
}

export interface PoReceiptRef {
  id: string;
  grn_number: string;
  supplier_invoice_no: string;
  total_paise: Paise;
  created_at: string;
}

export interface PurchaseOrder extends Omit<PurchaseOrderRow, 'lines' | 'ordered_qty' | 'received_qty'> {
  vendor_id: string;
  /** user who raised it — may not approve it (403; C-46) */
  raised_by?: string | null;
  notes: string | null;
  closed_reason: string | null;
  approved_at: string | null;
  drug_license_no: string | null;
  gst_number: string | null;
  items: PoItem[];
  receipts: PoReceiptRef[];
  /** every checked licence of the supplier (Sprint 30) */
  supplier_licences?: LicenceView[];
  supplier_licence_line?: string | null;
}

export interface NewPurchaseOrder {
  vendor_id: string;
  expected_by?: string;
  notes?: string;
  items: { product_id: string; quantity: number; unit_cost_paise: number }[];
}

export interface ReceiptRow {
  id: string;
  grn_number: string;
  supplier_invoice_no: string;
  supplier_invoice_date: string;
  total_paise: Paise;
  created_at: string;
  supplier_name: string;
  po_number: string | null;
}

/** GET /purchasing/receipts filters; '' means "any" */
export interface ReceiptFilter {
  from: string; // YYYY-MM-DD
  to: string;
  vendor_id: string;
  /** GRN or supplier invoice number */
  q: string;
  page: number;
  limit: number; // ≤ 200
}

export interface ReceiptPage {
  receipts: ReceiptRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ReceiptLine {
  id: string;
  product_name: string;
  sku: string;
  batch_number: string;
  expiry_date: string;
  manufactured_date: string | null;
  quantity: number;
  free_quantity: number;
  unit_cost_paise: number;
  printed_mrp_paise: number;
  gst_rate: number;
  taxable_paise: number;
  gst_paise: number;
}

export interface Receipt extends ReceiptRow {
  vendor_id: string;
  po_id: string | null;
  notes: string | null;
  supplier_gstin: string | null;
  /** licence as checked at receipt (Drugs Rules purchase record, C-02) */
  supplier_dl_no: string | null;
  taxable_paise: Paise;
  cgst_paise: Paise;
  sgst_paise: Paise;
  igst_paise: Paise;
  lines: ReceiptLine[];
}

export interface NewReceiptLine {
  po_item_id?: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  manufactured_date?: string;
  quantity: number;
  free_quantity?: number;
  unit_cost_paise: number;
  printed_mrp_paise: number;
}

export interface NewReceipt {
  vendor_id: string;
  po_id?: string;
  supplier_invoice_no: string;
  supplier_invoice_date: string;
  notes?: string;
  lines: NewReceiptLine[];
}

export interface ReceiptResult {
  id: string;
  grn_number: string;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
  /** supplier licences ending within 30 days, or no wholesale / manufacturing licence (warning, C-02) */
  licence_warnings?: string[];
}
