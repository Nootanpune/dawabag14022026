'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchShipments, markShipmentDelivered, partnerKeys } from '@/lib/partner/api';
import type { PartnerShipment, ShipmentStatus } from '@/lib/partner/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import ShipmentCard from '@/components/partner/shipments/ShipmentCard';
import DispatchDialog from '@/components/partner/shipments/DispatchDialog';

const TABS = [
  { value: 'pending', label: 'To dispatch' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export default function PartnerShipmentsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ShipmentStatus>('pending');
  const [dispatching, setDispatching] = useState<PartnerShipment | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: partnerKeys.shipments(status),
    queryFn: () => fetchShipments(status),
  });

  const delivered = useMutation({
    mutationFn: (s: PartnerShipment) => markShipmentDelivered(s.id),
    onSuccess: (_r, s) => toast.success(`${s.order_number} marked delivered`),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not mark as delivered')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['partner', 'shipments'] }),
  });

  return (
    <div>
      <PageHeader title="Shipments" onRefresh={() => refetch()} refreshing={isFetching} />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No shipments here" />
      <div className="space-y-3">
        {data?.map((s) => (
          <ShipmentCard
            key={s.id}
            shipment={s}
            onDispatch={setDispatching}
            onDelivered={(x) => delivered.mutate(x)}
            busy={delivered.isPending}
          />
        ))}
      </div>
      {dispatching && <DispatchDialog shipment={dispatching} onClose={() => setDispatching(null)} />}
    </div>
  );
}
