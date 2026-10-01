'use client';
import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadShipmentInvoice } from '@/lib/invoices/api';
import { normaliseBlobError } from '@/lib/download';
import { getApiErrorMessage } from '@/lib/apiErrors';

interface Props {
  shipmentId: string;
  invoiceNumber?: string | null;
  label?: string;
  className?: string;
}

/** Downloads the seller's tax invoice for one shipment (C-13, C-30). */
export default function InvoiceDownloadButton({ shipmentId, invoiceNumber, label = 'Invoice', className }: Props) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadShipmentInvoice(shipmentId, invoiceNumber);
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the invoice'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={className ?? 'btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1 disabled:opacity-50'}
      aria-label={invoiceNumber ? `Download invoice ${invoiceNumber}` : 'Download invoice'}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} {label}
    </button>
  );
}
