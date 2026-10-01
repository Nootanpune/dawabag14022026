// Shapes returned by /api/v1/einvoices (GST e-invoicing, C-31).
export const EINVOICE_STATUSES = ['pending', 'generated', 'failed', 'cancelled'] as const;
export type EinvoiceStatus = (typeof EINVOICE_STATUSES)[number];
export type EinvoiceDocType = 'INV' | 'CRN';

export interface Einvoice {
  id: string;
  doc_type: EinvoiceDocType;
  doc_number: string;
  status: EinvoiceStatus;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  last_attempt_at: string | null;
  created_at: string;
  shipment_id: string;
  credit_note_id: string | null;
  order_number: string;
  order_id: string;
  buyer_gstin: string | null;
}

export interface EinvoiceList {
  einvoices: Einvoice[];
  counts: Partial<Record<EinvoiceStatus, number>>;
  /** setting einvoice.enabled */
  enabled: boolean;
}
