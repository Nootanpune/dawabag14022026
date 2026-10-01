'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fulfilmentKeys, markDelivered } from '@/lib/fulfilment/api';
import { fetchMyRun, riderKeys } from '@/lib/fulfilment/riders';
import type { HandoverInput } from '@/lib/fulfilment/handover';
import type { RunStop } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import QueryState from '@/components/admin/QueryState';
import HandoverDialog from '@/components/delivery/HandoverDialog';
import RunStopCard from './RunStopCard';

/**
 * The signed-in rider's parcels (GET /fulfilment/my-run, Sprint 13), in pincode
 * order as the server sends them. Handover needs the buyer's 6-digit code for
 * prescription packs (C-26); a rider can close only their own parcels and has
 * no override.
 */
export default function RunSheet() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: riderKeys.myRun, queryFn: fetchMyRun, refetchInterval: 60000 });
  const [delivering, setDelivering] = useState<RunStop | null>(null);
  const [deliverError, setDeliverError] = useState('');

  const deliver = useMutation({
    mutationFn: ({ s, h }: { s: RunStop; h: HandoverInput }) => markDelivered(s.shipment_id, h),
    onSuccess: (_r, { s }) => {
      toast.success(`${s.order_number} delivered`);
      setDelivering(null);
    },
    onError: (err) => setDeliverError(getApiErrorMessage(err, 'Could not confirm delivery')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No parcels on your run sheet" />
      <div className="space-y-3">
        {data?.map((s) => (
          <RunStopCard
            key={s.shipment_id}
            stop={s}
            onDeliver={() => {
              setDeliverError('');
              setDelivering(s);
            }}
          />
        ))}
      </div>
      {delivering && (
        <HandoverDialog
          title={`Deliver to ${delivering.deliver_to ?? delivering.order_number}`}
          codeRequired={delivering.handover_code_required}
          allowOverride={false}
          pending={deliver.isPending}
          error={deliverError}
          onClose={() => setDelivering(null)}
          onConfirm={(h) => deliver.mutate({ s: delivering, h })}
        />
      )}
    </div>
  );
}
