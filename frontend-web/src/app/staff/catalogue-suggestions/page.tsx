'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import SuggestionImportForm from '@/components/staff/catalogueSuggestions/SuggestionImportForm';
import SuggestionImportResult from '@/components/staff/catalogueSuggestions/SuggestionImportResult';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { importSuggestions, type SuggestionImportResult as Result } from '@/lib/admin/catalogueSuggestions';
import { createDrafts, draftKeys } from '@/lib/admin/catalogueDrafts';
import { hasRole, MANAGER_ROLES, PHARMACIST_ROLES } from '@/lib/admin/roles';
import { useAuthStore } from '@/store/authStore';

// Sprint 46 (owner request 2026-10-04): suggested details for ONE partner's DRAFT products,
// prepared outside Dawabag. Shown to the pharmacist on "New products to complete"; never a
// decision — every product is decided and approved by a pharmacist (C-10, C-19). Audited (C-46).
function ImportPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const [result, setResult] = useState<Result | null>(null);
  const [last, setLast] = useState<{ file: File; partnerId: string } | null>(null);
  const [error, setError] = useState('');
  const run = useMutation({
    mutationFn: ({ file, partnerId }: { file: File; partnerId: string }) => importSuggestions(file, partnerId),
    onSuccess: (r, v) => {
      setResult(r);
      setLast(v);
      setError('');
      toast.success(`${r.counts.attached + r.counts.replaced} suggestion(s) added for ${r.partner.name}`);
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
    onError: (e) => { setResult(null); setError(getApiErrorMessage(e, 'Could not import the suggestions; nothing was changed')); },
  });
  // Sprint 29 "Create drafts" for exactly the partner's open requests behind "no draft yet" rows, then the same file again
  const drafts = useMutation({
    mutationFn: (ids: string[]) => createDrafts(ids),
    onSuccess: (r) => {
      toast.success(`${r.drafts_created} draft(s) created; importing the file again`);
      if (last) run.mutate(last);
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not create the drafts')),
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Import catalogue suggestions"
        subtitle="Suggested details for one partner's draft products — shown to the pharmacist, who checks them against the pack and decides each product"
        actions={<Link href="/staff/new-products?suggested=1" className="text-sm text-brand-700 underline">Drafts with suggestions</Link>} />
      <SuggestionImportForm pending={run.isPending} onImport={(file, partnerId) => run.mutate({ file, partnerId })} />
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      {result && (
        <SuggestionImportResult result={result} canCreateDrafts={hasRole(role, MANAGER_ROLES)}
          creating={drafts.isPending || run.isPending} onCreateDrafts={() => drafts.mutate(result.open_request_ids)} />
      )}
    </div>
  );
}

export default function CatalogueSuggestionsPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <ImportPage />
    </RequireAuth>
  );
}
