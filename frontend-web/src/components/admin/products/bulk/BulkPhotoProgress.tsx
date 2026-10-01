import { Loader2 } from 'lucide-react';
import type { BulkUploadState } from './useBulkPhotoUpload';

/** Upload progress: files sent so far and the batch being sent. */
export default function BulkPhotoProgress({ state }: { state: BulkUploadState }) {
  const pct = state.total ? Math.round((state.sent / state.total) * 100) : 0;
  return (
    <div className="card text-sm space-y-2" role="status" aria-live="polite">
      <p className="inline-flex items-center gap-2 text-gray-700">
        <Loader2 className="w-4 h-4 animate-spin" /> Uploading batch {state.batch} of {state.batches} — {state.sent} of {state.total} photos sent
      </p>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
