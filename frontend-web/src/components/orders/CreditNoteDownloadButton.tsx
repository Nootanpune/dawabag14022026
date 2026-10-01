'use client';
import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCreditNote } from '@/lib/returns/api';
import { normaliseBlobError } from '@/lib/download';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Credit note PDF via the signed-in API client (C-37); nothing is kept by the app. */
export default function CreditNoteDownloadButton({ id, number }: { id: string; number: string }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadCreditNote(id, number);
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the credit note'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="btn-outline text-xs py-1 px-2 inline-flex items-center gap-1 disabled:opacity-50"
      aria-label={`Download credit note ${number}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF
    </button>
  );
}
