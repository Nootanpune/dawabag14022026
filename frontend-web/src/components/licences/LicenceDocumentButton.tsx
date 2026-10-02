'use client';
import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { licenceDocumentUrl } from '@/lib/licences/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Opens the licence scan through a 5-minute signed link (every view is logged on the server, C-41). */
export default function LicenceDocumentButton({ licenceId, where }: { licenceId: string; where: 'partner' | 'buyer' | 'admin' }) {
  const [opening, setOpening] = useState(false);
  const open = async () => {
    const tab = window.open('', '_blank');   // opened now so pop-up blockers allow it
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const url = await licenceDocumentUrl(where, licenceId);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      tab?.close();
      toast.error(err?.response?.status === 503 ? 'Document storage is not set up on this server' : getApiErrorMessage(err, 'Could not open the licence'));
    } finally {
      setOpening(false);
    }
  };
  return (
    <button type="button" onClick={open} disabled={opening}
      className="text-xs font-medium text-brand-700 border border-brand-600 rounded-lg px-2 py-1 hover:bg-brand-50 inline-flex items-center gap-1">
      {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />}
      View licence
    </button>
  );
}
