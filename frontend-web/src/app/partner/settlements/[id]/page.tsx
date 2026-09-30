'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchMySettlement, partnerKeys } from '@/lib/partner/api';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import BackLink from '@/components/admin/BackLink';
import SettlementDetailView from '@/components/settlements/SettlementDetailView';

export default function PartnerSettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: partnerKeys.settlement(id),
    queryFn: () => fetchMySettlement(id),
  });

  return (
    <div>
      <BackLink href="/partner/settlements" label="Settlements" />
      <PageHeader title={data?.batch_ref ?? 'Settlement'} onRefresh={() => refetch()} refreshing={isFetching} />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && <SettlementDetailView settlement={data} />}
    </div>
  );
}
