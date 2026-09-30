'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchShipmentQueue, fulfilmentKeys, markDelivered, packShipment } from '@/lib/fulfilment/api';
import type { QueueShipment, QueueStage } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import QueryState from '@/components/admin/QueryState';
import StaffShipmentCard from './StaffShipmentCard';
import StaffDispatchDialog from './StaffDispatchDialog';

type ShipmentStage = Exclude<QueueStage, 'rx'>;

const COPY: Record<ShipmentStage, { action: string; empty: string }> = {
  pack: { action: 'Mark packed', empty: 'Nothing waiting to be packed' },
  dispatch: { action: 'Dispatch', empty: 'Nothing packed and waiting for dispatch' },
  deliver: { action: 'Mark delivered', empty: 'No shipments out for delivery' },
};

/**
 * Dawabag-own shipments at one stage. Pack and dispatch are refused by the
 * server while a prescription line is unverified (C-08) or a batch is
 * recalled (C-28); the message from the server is shown as-is.
 */
export default function ShipmentQueue({ stage }: { stage: ShipmentStage }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: fulfilmentKeys.queue(stage),
    queryFn: () => fetchShipmentQueue(stage),
    refetchInterval: 60000,
  });
  const [dispatching, setDispatching] = useState<QueueShipment | null>(null);

  const act = useMutation({
    mutationFn: (s: QueueShipment) => (stage === 'pack' ? packShipment(s.shipment_id) : markDelivered(s.shipment_id)),
    onSuccess: (_r, s) => toast.success(`${s.order_number} ${stage === 'pack' ? 'packed' : 'delivered'}`),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update the shipment')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  const onAction = (s: QueueShipment) => {
    if (stage === 'dispatch') return setDispatching(s);
    if (stage === 'deliver' && !window.confirm(`Confirm ${s.order_number} was handed to the buyer?`)) return;
    act.mutate(s);
  };

  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText={COPY[stage].empty} />
      <div className="space-y-3">
        {data?.map((s) => (
          <StaffShipmentCard
            key={s.shipment_id}
            shipment={s}
            actionLabel={COPY[stage].action}
            onAction={() => onAction(s)}
            busy={act.isPending && act.variables?.shipment_id === s.shipment_id}
          />
        ))}
      </div>
      {dispatching && <StaffDispatchDialog shipment={dispatching} onClose={() => setDispatching(null)} />}
    </div>
  );
}
