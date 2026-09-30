// src/services/pdf.service.ts
// Invoice PDF rendering is not built yet. einvoice.service.ts calls this after the
// IRN is saved; returning null leaves e_invoices.invoice_pdf_s3_key empty instead
// of failing an e-invoice that the IRP has already accepted.
import { logger } from '../config/logger';

export interface InvoicePDFInput {
  order: any;
  buyer?: any;
  items?: any[];
  irn: string | null;
  ackNo?: string;
  ackDt?: string;
  qrCode: string | null;
  sellerGSTIN: string;
}

export async function generateInvoicePDF(input: InvoicePDFInput): Promise<string | null> {
  logger.warn(`Invoice PDF not generated for order ${input.order?.order_number ?? input.order?.id}: pdf.service not implemented`);
  return null;
}
