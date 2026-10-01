'use client';
import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadMyData } from '@/lib/privacy/api';
import { normaliseBlobError } from '@/lib/download';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** GET /privacy/export — everything held about you, built fresh by the server (C-42). */
export default function DownloadMyData() {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadMyData();
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download your data'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold text-sm">Your data</h2>
        <p className="text-xs text-gray-500">Profile, addresses, orders, prescriptions list, consents and complaints as a JSON file.</p>
      </div>
      <button onClick={download} disabled={busy} className="btn-outline text-sm inline-flex items-center gap-1 disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Download my data
      </button>
    </div>
  );
}
