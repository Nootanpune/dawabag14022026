'use client';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadEPrescriptionPdf } from '@/lib/telemedicine/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { normaliseBlobError } from '@/lib/download';

/** Downloads the e-prescription PDF through the authenticated client. */
export default function EPrescriptionPdfButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadEPrescriptionPdf(id);
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the PDF'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={download} disabled={busy} className="btn-outline text-sm inline-flex items-center gap-2">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download PDF
    </button>
  );
}
