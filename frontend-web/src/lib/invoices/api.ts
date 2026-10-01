// Tax invoices — one per shipment / seller of record (C-13, C-30). The PDF is
// rendered by the server on each request; the app never keeps a copy.
import { downloadFromApi } from '../download';

export function invoiceFileName(invoiceNumber: string | null | undefined): string {
  return `${(invoiceNumber ?? 'invoice').replace(/[\\/]/g, '-')}.pdf`;
}

/** GET /invoices/shipments/:shipmentId.pdf and hand it to the browser's save dialog. */
export function downloadShipmentInvoice(shipmentId: string, invoiceNumber?: string | null) {
  return downloadFromApi(`/invoices/shipments/${shipmentId}.pdf`, invoiceFileName(invoiceNumber));
}
