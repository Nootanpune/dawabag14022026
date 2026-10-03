'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import StatusTabs from '@/components/admin/StatusTabs';
import ImportedDraftCounts from '@/components/staff/medicineInfo/imports/ImportedDraftCounts';
import ImportedDraftsList from '@/components/staff/medicineInfo/imports/ImportedDraftsList';
import PartnerSelect from '@/components/staff/medicineInfo/imports/PartnerSelect';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

const TABS = [
  { value: 'draft', label: 'To check' },
  { value: 'pending_review', label: 'Sent, waiting for approval' },
] as const;

// Sprint 45 — the pharmacist works through imported drafts, by partner: open, check every
// line against the pack insert, edit, send; a second pharmacist approves (C-19).
function Queue() {
  const [partnerId, setPartnerId] = useState(useSearchParams()?.get('partner') ?? '');
  const [status, setStatus] = useState<'draft' | 'pending_review'>('draft');
  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title="Imported drafts to check"
        subtitle="Medicine information written outside Dawabag: check every line against the pack insert, then send it for a second pharmacist's approval"
        actions={<Link href="/staff/medicine-info-imports" className="text-sm text-brand-700 underline">Import drafts</Link>} />
      <ImportedDraftCounts />
      <div className="max-w-sm">
        <label htmlFor="queue-partner" className="block text-xs font-medium text-gray-700 mb-1">Partner</label>
        <PartnerSelect id="queue-partner" value={partnerId} onChange={setPartnerId} allLabel="All partners" />
      </div>
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <ImportedDraftsList partnerId={partnerId} status={status} />
    </div>
  );
}

export default function ImportedDraftsPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <Suspense fallback={null}>
        <Queue />
      </Suspense>
    </RequireAuth>
  );
}
