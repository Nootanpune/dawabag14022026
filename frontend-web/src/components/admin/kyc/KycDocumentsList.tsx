'use client';
import { useState } from 'react';
import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDocumentUrl, type KycDocument } from '@/lib/admin/kyc';
import { formatDateTimeIST } from '@/lib/admin/format';
import { formatFileSize, DOCUMENT_LABELS, type DocumentType } from '@/lib/registration';
import { getApiErrorMessage } from '@/lib/apiErrors';

export default function KycDocumentsList({ documents }: { documents: KycDocument[] }) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  const view = async (doc: KycDocument) => {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setOpeningId(doc.id);
    try {
      const url = await fetchDocumentUrl(doc.id);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      tab?.close();
      toast.error(
        err?.response?.status === 503
          ? 'Document storage not configured'
          : getApiErrorMessage(err, 'Could not open document')
      );
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-3">Documents</h3>
      {documents.length === 0 ? (
        <p className="text-sm text-gray-400">No documents uploaded.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 border border-gray-100 rounded-lg p-2.5">
              <FileText className="w-5 h-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {DOCUMENT_LABELS[d.document_type as DocumentType] ?? d.document_type}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {d.original_name} · {formatFileSize(d.size_bytes)} · {formatDateTimeIST(d.uploaded_at)}
                </p>
              </div>
              <button
                onClick={() => view(d)}
                disabled={openingId === d.id}
                className="text-xs font-medium text-brand-600 border border-brand-600 rounded-lg px-2.5 py-1.5 hover:bg-brand-50 inline-flex items-center gap-1"
              >
                {openingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                View
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
