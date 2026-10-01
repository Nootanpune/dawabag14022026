// Partner settlement shapes shared by the partner portal and admin (values are the server's).

export interface Settlement {
  id: string;
  batch_ref: string;
  partner_id: string;
  partner_name: string;
  period_from: string;
  period_to: string;
  total_orders: number;
  gross_sale_value_paise: number;
  taxable_value_paise: number;
  gst_collected_paise: number;
  commission_paise: number;
  finding_fee_paise: number;
  fee_gst_paise: number;
  tcs_paise: number;
  tds_paise: number;
  net_payable_paise: number;
  commission_invoice_no: string | null;
  payment_status: string;
  payment_mode: string | null;
  utr_reference: string | null;
  paid_at: string | null;
  created_at: string;
  /** returns deducted in this batch (C-37); older batches may not send it */
  return_deductions_paise?: number | null;
}

export interface SettlementLine {
  id: string;
  order_number: string;
  partner_invoice_number: string | null;
  product_name: string;
  allocated_qty: number;
  line_value_paise: number;
  line_gst_paise: number;
  commission_pct: number | string;
  commission_paise: number;
  delivered_at: string | null;
}

/** A return credit note deducted from the partner's net sales (negative values). */
export interface SettlementAdjustment {
  id: string;
  taxable_paise: number;
  gst_paise: number;
  reason: string;
  credit_note_number: string | null;
  created_at: string;
}

export type SettlementDetail = Settlement & { lines: SettlementLine[]; adjustments?: SettlementAdjustment[] };

export const SETTLEMENT_STATUSES = ['pending', 'processed', 'paid', 'disputed', 'on_hold'] as const;
