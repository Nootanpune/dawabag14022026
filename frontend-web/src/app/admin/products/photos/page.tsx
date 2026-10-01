'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Loader2, Upload } from 'lucide-react';
import { MANAGER_ROLES } from '@/lib/admin/roles';
import { addToPlan, removeFromPlan, sendable, type PlannedPhoto } from '@/lib/admin/bulkPhotos/plan';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import BulkPhotoPicker from '@/components/admin/products/bulk/BulkPhotoPicker';
import BulkPhotoPlanTable from '@/components/admin/products/bulk/BulkPhotoPlanTable';
import BulkPhotoProgress from '@/components/admin/products/bulk/BulkPhotoProgress';
import BulkPhotoResultsTable from '@/components/admin/products/bulk/BulkPhotoResultsTable';
import { useBulkPhotoUpload } from '@/components/admin/products/bulk/useBulkPhotoUpload';

// Bulk pack photos by SKU: choose → check the SKU mapping → upload in batches of
// ≤ 50 → per-file results. Every saved photo waits for pharmacist approval (C-19);
// photos go only to the server object store, never stored in the browser.
function BulkPhotosPage() {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<PlannedPhoto[]>([]);
  const { state, start, reset } = useBulkPhotoUpload();
  const ready = sendable(plan).length;

  const addFiles = (files: File[]) => {
    if (state.results) {
      reset();
      setPlan(addToPlan([], files));
    } else setPlan((p) => addToPlan(p, files));
  };
  const upload = async () => {
    await start(plan);
    queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
  };
  const clear = () => {
    reset();
    setPlan([]);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Pack photos" subtitle="Upload many product photos at once, matched to products by SKU" />
      <BulkPhotoPicker onFiles={addFiles} disabled={state.running} />

      {!!plan.length && !state.results && (
        <>
          <BulkPhotoPlanTable plan={plan} onRemove={(id) => setPlan((p) => removeFromPlan(p, id))} disabled={state.running} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-600">
              {ready} of {plan.length} files ready
            </span>
            <button type="button" className="btn-outline text-sm" onClick={clear} disabled={state.running}>
              Clear
            </button>
            <button type="button" className="btn-primary text-sm inline-flex items-center gap-2 ml-auto" onClick={upload} disabled={!ready || state.running}>
              {state.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload {ready} photo{ready === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}

      {state.running && <BulkPhotoProgress state={state} />}
      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
          {state.error}
        </p>
      )}

      {state.results && (
        <>
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
            Uploaded photos are not shown to customers until a pharmacist approves them (C-19).
            <Link href="/staff/content-review" className="inline-flex items-center gap-1 font-medium underline">
              <ClipboardCheck className="w-4 h-4" /> Open the pharmacist review queue
            </Link>
          </p>
          <BulkPhotoResultsTable results={state.results} />
          <button type="button" className="btn-outline text-sm" onClick={clear}>
            Upload more photos
          </button>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth roles={MANAGER_ROLES}>
      <BulkPhotosPage />
    </RequireAuth>
  );
}
