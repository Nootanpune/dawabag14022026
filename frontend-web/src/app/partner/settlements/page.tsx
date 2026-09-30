'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchMySettlements, partnerKeys } from '@/lib/partner/api';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import SettlementsTable from '@/components/settlements/SettlementsTable';

export default function PartnerSettlementsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: partnerKeys.settlements,
    queryFn: fetchMySettlements,
  });

  return (
    <div>
      <PageHeader title="Settlements" onRefresh={() => refetch()} refreshing={isFetching} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No settlements yet" />
      {!!data?.length && <SettlementsTable settlements={data} basePath="/partner/settlements" />}
    </div>
  );
}
