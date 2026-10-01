// Shapes returned by /api/v1/stock/*. value_paise is a bigint and may arrive as a string.
export type ExpiryFilter = 'expired' | 'near' | 'ok';

export interface Batch {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  quantity_available: number;
  quantity_reserved: number;
  purchase_price_paise: number | null;
  printed_mrp_paise: number | null;
  storage_location: string | null;
  is_recalled: boolean;
  product_name: string;
  sku: string;
  drug_schedule: string | null;
  cold_chain: boolean;
  supplier_name: string | null;
  days_to_expiry: number;
}

export const ADJUSTMENT_REASONS = [
  'damaged',
  'expired',
  'recalled',
  'count_variance',
  'theft_loss',
  'found',
  'return_to_supplier',
  'sample',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];
export type AdjustmentStatus = 'requested' | 'approved' | 'rejected';
export type DisposalMethod = 'incineration' | 'authorised_vendor' | 'returned_to_manufacturer';

export interface Adjustment {
  id: string;
  adjustment_no: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  product_name: string;
  sku: string;
  drug_schedule: string | null;
  quantity_delta: number;
  reason: AdjustmentReason;
  notes: string;
  status: AdjustmentStatus;
  created_at: string;
  decided_at: string | null;
  decision_notes: string | null;
  requested_by_name: string;
  approved_by_name: string | null;
  value_paise: number | string;
  disposal_method: DisposalMethod | null;
  disposal_reference: string | null;
  disposal_witness: string | null;
  disposed_at: string | null;
}

export interface NewAdjustment {
  batch_id: string;
  quantity_delta: number;
  reason: AdjustmentReason;
  notes: string;
}

export type CountStatus = 'open' | 'submitted' | 'approved' | 'cancelled';

export interface StockCount {
  id: string;
  count_no: string;
  scope: string;
  status: CountStatus;
  counted_by: string;
  approved_by: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  lines: number;
}

export interface CountLine {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  storage_location: string | null;
  product_name: string;
  sku: string;
  system_qty: number;
  counted_qty: number | null;
}

export interface StockCountDetail extends Omit<StockCount, 'lines'> {
  lines: CountLine[];
}
