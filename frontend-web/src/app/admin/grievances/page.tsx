'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllGrievances, grievanceKeys } from '@/lib/grievances/api';
import PageHeader from '@/components/admin/PageHeader';
import StatusTabs from '@/components/admin/StatusTabs';
import QueryState from '@/components/admin/QueryState';
import GrievanceTable from '@/components/admin/grievances/GrievanceTable';

const TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
] as const;

type Tab = (typeof TABS)[number]['value'];

// Complaint queue with 48 h / 30 day deadline flags (C-36).
export default function AdminGrievancesPage() {
  const [status, setStatus] = useState<Tab>('open');
  const [overdue, setOverdue] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: grievanceKeys.all(status, overdue),
    queryFn: () => fetchAllGrievances(status, overdue),
  });

  return (
    <div>
      <PageHeader
        title="Complaints"
        subtitle="Acknowledge within 48 hours, resolve within 30 days"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue only
          </label>
        }
      />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No complaints match" />
      {!!data?.length && <GrievanceTable rows={data} />}
    </div>
  );
}
