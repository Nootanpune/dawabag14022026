'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adrKeys, fetchStaffAdrs, type AdrStatus } from '@/lib/compliance/adverseEvents';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import AdrTable from '@/components/staff/adverse/AdrTable';
import AdrReviewDialog from '@/components/staff/adverse/AdrReviewDialog';

const TABS: { value: AdrStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'forwarded', label: 'Forwarded' },
  { value: 'closed', label: 'Closed' },
];

// Side-effect reports: review and forward to PvPI (C-29)
function AdrQueue() {
  const [status, setStatus] = useState<AdrStatus>('new');
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: adrKeys.staff(status),
    queryFn: () => fetchStaffAdrs(status),
  });
  return (
    <div>
      <PageHeader
        title="Side-effect reports"
        subtitle="Serious reports first. Forward to PvPI before the due date and record the reference."
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No reports here" />
      {!!data?.length && <AdrTable rows={data} onOpen={setOpen} />}
      {open && <AdrReviewDialog id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default function StaffAdverseEventsPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <AdrQueue />
    </RequireAuth>
  );
}
