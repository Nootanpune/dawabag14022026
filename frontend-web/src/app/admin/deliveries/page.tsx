'use client';
import { useQuery } from '@tanstack/react-query';
import { deliveryKeys, fetchDispatchedOrders } from '@/lib/admin/deliveries';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import DispatchedOrderRow from '@/components/admin/deliveries/DispatchedOrderRow';

// Confirm deliveries for any seller, with an audited override when the buyer's code is unavailable (C-26)
export default function AdminDeliveriesPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: deliveryKeys.dispatched,
    queryFn: fetchDispatchedOrders,
  });
  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle="Orders on their way. Confirm a handover here when the courier cannot, or after 5 wrong codes."
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No orders are out for delivery" />
      <div className="space-y-2">{data?.map((o) => <DispatchedOrderRow key={o.id} order={o} />)}</div>
    </div>
  );
}
