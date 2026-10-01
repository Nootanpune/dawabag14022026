'use client';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadDestructionCsv } from '@/lib/stock/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { normaliseBlobError } from '@/lib/download';

/** Downloads the destruction register (pending or destroyed view) as CSV from the server. */
export default function DestructionCsvButton({ pending }: { pending: boolean }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadDestructionCsv(pending);
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the register'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={download} disabled={busy} className="btn-outline text-sm inline-flex items-center gap-1 disabled:opacity-50">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download CSV
    </button>
  );
}
