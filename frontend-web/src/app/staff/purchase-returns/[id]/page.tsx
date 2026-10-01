'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchPurchaseReturn, purchaseReturnKeys } from '@/lib/purchaseReturns/api';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ReturnSummary from '@/components/staff/purchaseReturns/ReturnSummary';
import ReturnActions from '@/components/staff/purchaseReturns/ReturnActions';
import ReturnLinesTable from '@/components/staff/purchaseReturns/ReturnLinesTable';

function PurchaseReturnDetail({ id }: { id: string }) {
  const { data: r, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: purchaseReturnKeys.one(id),
    queryFn: () => fetchPurchaseReturn(id),
  });
  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!r} emptyText="Return not found" />
      {r && (
        <>
          <PageHeader title={r.return_no} subtitle={r.supplier_name} onRefresh={() => refetch()} refreshing={isFetching} />
          <ReturnSummary r={r} />
          <ReturnActions r={r} />
          <ReturnLinesTable lines={r.lines} />
        </>
      )}
    </div>
  );
}

export default function PurchaseReturnPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth roles={STORE_ROLES}>
      <BackLink href="/staff/purchase-returns" label="Purchase returns" />
      <PurchaseReturnDetail id={id} />
    </RequireAuth>
  );
}
