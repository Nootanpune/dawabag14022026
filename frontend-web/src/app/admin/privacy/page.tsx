'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDataRequests, privacyKeys, type DataRequest } from '@/lib/privacy/api';
import PageHeader from '@/components/admin/PageHeader';
import StatusTabs from '@/components/admin/StatusTabs';
import QueryState from '@/components/admin/QueryState';
import DataRequestTable from '@/components/admin/privacy/DataRequestTable';
import HandleRequestDialog from '@/components/admin/privacy/HandleRequestDialog';

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
] as const;

type Tab = (typeof TABS)[number]['value'];

// Data-principal requests under the DPDP Act (C-40..C-44)
export default function AdminPrivacyPage() {
  const [status, setStatus] = useState<Tab>('pending');
  const [handling, setHandling] = useState<{ r: DataRequest; action: 'complete' | 'reject' } | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: privacyKeys.requests(status),
    queryFn: () => fetchDataRequests(status),
  });

  return (
    <div>
      <PageHeader
        title="Data requests"
        subtitle="Correction and erasure requests from users"
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No requests" />
      {!!data?.length && <DataRequestTable rows={data} onAction={(r, action) => setHandling({ r, action })} />}
      {handling && <HandleRequestDialog request={handling.r} action={handling.action} onClose={() => setHandling(null)} />}
    </div>
  );
}
