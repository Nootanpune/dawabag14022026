'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDeliveries, notificationKeys } from '@/lib/notifications/api';
import type { DeliveryFilter } from '@/lib/notifications/types';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import DeliverySummary from '@/components/admin/notifications/DeliverySummary';
import DeliveryFilters from '@/components/admin/notifications/DeliveryFilters';
import DeliveryTable from '@/components/admin/notifications/DeliveryTable';

// SMS / email / push delivery log. SMS goes only through DLT-registered templates (TRAI),
// so a message type without one is logged as skipped.
export default function NotificationDeliveriesPage() {
  const [filter, setFilter] = useState<DeliveryFilter>({ status: '', channel: '' });
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: notificationKeys.deliveries(filter),
    queryFn: () => fetchDeliveries(filter),
  });

  return (
    <div>
      <PageHeader
        title="Notification deliveries"
        subtitle="Latest 300 SMS, email and push attempts. Skipped SMS usually means no DLT template is set for that message."
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      {data && <DeliverySummary counts={data.last_7_days} />}
      <DeliveryFilters value={filter} onChange={setFilter} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.deliveries.length} emptyText="No deliveries match" />
      {!!data?.deliveries.length && <DeliveryTable rows={data.deliveries} />}
    </div>
  );
}
