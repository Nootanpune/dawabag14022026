'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchMyReturns, returnKeys } from '@/lib/returns/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ReturnListItem from '@/components/returns/ReturnListItem';
import MyRefundsList from '@/components/returns/MyRefundsList';

// Returns and refunds (C-37). Raise a return from a delivered shipment on the order page.
export default function MyReturnsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: returnKeys.mine, queryFn: fetchMyReturns });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div>
          <BackLink href="/account" label="My account" />
          <h1 className="text-lg font-semibold">Returns and refunds</h1>
          <p className="text-xs text-gray-500">
            To report a damaged, wrong, missing or expired item, open the order and choose “Report a problem / return”.
          </p>
        </div>
        <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="You have no returns." />
        <div className="space-y-3">
          {data?.map((r) => <ReturnListItem key={r.id} r={r} href={`/account/returns/${r.id}`} />)}
        </div>
        <MyRefundsList />
      </div>
    </div>
  );
}
