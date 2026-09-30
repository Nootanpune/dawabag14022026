'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSettlements, settlementKeys } from '@/lib/admin/settlements';
import { SETTLEMENT_STATUSES } from '@/lib/marketplace/settlement';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import SettlementsTable from '@/components/settlements/SettlementsTable';
import GenerateSettlementsForm from '@/components/admin/settlements/GenerateSettlementsForm';

const TABS = [
  { value: '', label: 'All' },
  ...SETTLEMENT_STATUSES.map((s) => ({ value: s as string, label: s.replace(/_/g, ' ') })),
];

export default function AdminSettlementsPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: settlementKeys.list(status),
    queryFn: () => fetchSettlements(status || undefined),
  });

  return (
    <div>
      <PageHeader title="Partner settlements" onRefresh={() => refetch()} refreshing={isFetching} />
      <GenerateSettlementsForm />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No settlements" />
      {!!data?.length && <SettlementsTable settlements={data} basePath="/admin/settlements" showPartner />}
    </div>
  );
}
