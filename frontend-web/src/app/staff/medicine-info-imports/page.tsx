'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import ImportDraftsForm from '@/components/staff/medicineInfo/imports/ImportDraftsForm';
import ImportDraftsResult from '@/components/staff/medicineInfo/imports/ImportDraftsResult';
import ImportedDraftCounts from '@/components/staff/medicineInfo/imports/ImportedDraftCounts';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { importDrafts, type ImportDraftsResult as Result } from '@/lib/medicineInfo/imports';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

// Sprint 45 (owner request 2026-10-03): medicine information for ONE partner's products,
// written outside Dawabag, imported as drafts. A registered pharmacist checks and sends
// each one; a second registered pharmacist approves (four eyes, C-19). Audited (C-46).
function ImportPage() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const run = useMutation({
    mutationFn: ({ file, partnerId, replace }: { file: File; partnerId: string; replace: boolean }) => importDrafts(file, partnerId, replace),
    onSuccess: (r) => {
      setResult(r);
      setError('');
      toast.success(`${r.counts.created + r.counts.replaced} draft(s) imported for ${r.partner.name}`);
      queryClient.invalidateQueries({ queryKey: ['medicine-info'] });
    },
    onError: (e) => { setResult(null); setError(getApiErrorMessage(e, 'Could not import the drafts; nothing was changed')); },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Import medicine information drafts"
        subtitle="Drafts written outside Dawabag, for one partner's products — checked by a registered pharmacist, approved by a second"
        actions={<Link href="/staff/medicine-info-imported" className="text-sm text-brand-700 underline">Imported drafts to check</Link>} />
      <ImportedDraftCounts />
      <ImportDraftsForm pending={run.isPending} onImport={(file, partnerId, replace) => run.mutate({ file, partnerId, replace })} />
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      {result && <ImportDraftsResult result={result} />}
    </div>
  );
}

export default function MedicineInfoImportsPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <ImportPage />
    </RequireAuth>
  );
}
