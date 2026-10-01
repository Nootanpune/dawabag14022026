'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchPartnerReturns, returnKeys } from '@/lib/returns/api';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ReturnListItem from '@/components/returns/ReturnListItem';

// Returns on the partner's shipments, read-only; Dawabag decides them (C-37)
export default function PartnerReturnsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: returnKeys.partner, queryFn: fetchPartnerReturns });
  return (
    <div>
      <PageHeader
        title="Returns"
        subtitle="Approved returns are credited to the buyer from your invoice and deducted from your next settlement"
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No returns on your shipments" />
      <div className="space-y-3">
        {data?.map((r) => <ReturnListItem key={r.id} r={r} href={`/partner/returns/${r.id}`} />)}
      </div>
    </div>
  );
}
