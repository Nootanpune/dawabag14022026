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
import ReassignRiderDialog from './ReassignRiderDialog';
import { OWN_RIDER_COURIER } from '@/lib/fulfilment/riders';

type ShipmentStage = Exclude<QueueStage, 'rx' | 'check'>;

// Packers see the Deliver tab only to reassign riders; delivery is confirmed by riders and managers (C-26)
const DELIVER_ROLES = ['delivery', 'admin', 'super_admin'];

const COPY: Record<ShipmentStage, { action: string; empty: string }> = {
  pack: { action: 'Mark packed', empty: 'Nothing waiting to be packed' },   // shipments still with the pharmacist show, blocked
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
  // Sprint 13: a parcel out with our own rider can be handed to another rider
  const [reassigning, setReassigning] = useState<QueueShipment | null>(null);
  const [deliverError, setDeliverError] = useState('');

  const pack = useMutation({
    mutationFn: (s: QueueShipment) => packShipment(s.shipment_id),
    // B2B invoices are registered with the IRP before dispatch is allowed (C-31)
    onSuccess: (r, s) =>
      toast.success(`${s.order_number} packed`, {
        description: r?.einvoice_required ? 'B2B invoice: registering the e-invoice (IRN) before dispatch' : undefined,
      }),
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

  // Sprint 35: packing waits for the pharmacist's release (the server refuses it too, C-08)
  const blockedFor = (s: QueueShipment) => {
    if (stage !== 'pack' || !s.pharmacist_check || s.pharmacist_check === 'released' || s.pharmacist_check === 'not_recorded') return undefined;
    return s.pharmacist_check === 'held'
      ? `On hold by the pharmacist: ${s.pharmacist_check_note ?? 'no reason given'}`
      : 'Waiting for the pharmacist check — cannot be packed until a pharmacist releases it.';
  };

  const extraFor = (s: QueueShipment) => {
    if (stage === 'dispatch' && s.status === 'packed' && !s.awb_number) return <BookCourierButton shipment={s} />;
    if (stage === 'deliver' && s.courier_partner === OWN_RIDER_COURIER) {
      return (
        <button onClick={() => setReassigning(s)} className="btn-outline text-xs py-1.5 px-3">
          Reassign rider
        </button>
      );
    }
    return undefined;
  };

  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText={COPY[stage].empty} />
      <div className="space-y-3">
        {data?.map((s) => (
          <StaffShipmentCard
            key={s.shipment_id}
            shipment={s}
            actionLabel={stage === 'deliver' && !hasRole(role, DELIVER_ROLES) ? '' : COPY[stage].action}
            onAction={() => onAction(s)}
            busy={pack.isPending && pack.variables?.shipment_id === s.shipment_id}
            extra={extraFor(s)}
            blockedReason={blockedFor(s)}
          />
        ))}
      </div>
      {dispatching && <StaffDispatchDialog shipment={dispatching} onClose={() => setDispatching(null)} />}
      {reassigning && <ReassignRiderDialog shipment={reassigning} onClose={() => setReassigning(null)} />}
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
