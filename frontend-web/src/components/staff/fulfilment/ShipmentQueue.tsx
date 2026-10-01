'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchShipmentQueue, fulfilmentKeys, markDelivered, packShipment } from '@/lib/fulfilment/api';
import type { HandoverInput } from '@/lib/fulfilment/handover';
import type { QueueShipment, QueueStage } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { hasRole, MANAGER_ROLES } from '@/lib/admin/roles';
import { useAuthStore } from '@/store/authStore';
import QueryState from '@/components/admin/QueryState';
import HandoverDialog from '@/components/delivery/HandoverDialog';
import StaffShipmentCard from './StaffShipmentCard';
import StaffDispatchDialog from './StaffDispatchDialog';
import BookCourierButton from './BookCourierButton';

type ShipmentStage = Exclude<QueueStage, 'rx'>;

const COPY: Record<ShipmentStage, { action: string; empty: string }> = {
  pack: { action: 'Mark packed', empty: 'Nothing waiting to be packed' },
  dispatch: { action: 'Dispatch', empty: 'Nothing packed and waiting for dispatch' },
  deliver: { action: 'Mark delivered', empty: 'No shipments out for delivery' },
};

/**
 * Dawabag-own shipments at one stage. Pack and dispatch are refused by the
 * server while a prescription line is unverified (C-08) or a batch is
 * recalled (C-28); delivery needs the buyer's code for prescription packs
 * (C-26). The message from the server is shown as-is.
 */
export default function ShipmentQueue({ stage }: { stage: ShipmentStage }) {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading, error } = useQuery({
    queryKey: fulfilmentKeys.queue(stage),
    queryFn: () => fetchShipmentQueue(stage),
    refetchInterval: 60000,
  });
  const [dispatching, setDispatching] = useState<QueueShipment | null>(null);
  const [delivering, setDelivering] = useState<QueueShipment | null>(null);
  const [deliverError, setDeliverError] = useState('');

  const pack = useMutation({
    mutationFn: (s: QueueShipment) => packShipment(s.shipment_id),
    onSuccess: (_r, s) => toast.success(`${s.order_number} packed`),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update the shipment')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  const deliver = useMutation({
    mutationFn: ({ s, h }: { s: QueueShipment; h: HandoverInput }) => markDelivered(s.shipment_id, h),
    onSuccess: (_r, { s }) => {
      toast.success(`${s.order_number} delivered`);
      setDelivering(null);
    },
    onError: (err) => setDeliverError(getApiErrorMessage(err, 'Could not confirm delivery')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  const onAction = (s: QueueShipment) => {
    if (stage === 'dispatch') return setDispatching(s);
    if (stage === 'deliver') {
      setDeliverError('');
      return setDelivering(s);
    }
    pack.mutate(s);
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
            busy={pack.isPending && pack.variables?.shipment_id === s.shipment_id}
            extra={stage === 'dispatch' && s.status === 'packed' && !s.awb_number ? <BookCourierButton shipment={s} /> : undefined}
          />
        ))}
      </div>
      {dispatching && <StaffDispatchDialog shipment={dispatching} onClose={() => setDispatching(null)} />}
      {delivering && (
        <HandoverDialog
          title={`Deliver ${delivering.order_number}`}
          codeRequired={delivering.handover_code_required}
          allowOverride={hasRole(role, MANAGER_ROLES)}
          pending={deliver.isPending}
          error={deliverError}
          onClose={() => setDelivering(null)}
          onConfirm={(h) => deliver.mutate({ s: delivering, h })}
        />
      )}
    </div>
  );
}
