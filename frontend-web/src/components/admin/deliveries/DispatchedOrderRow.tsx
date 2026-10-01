'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { adminMarkDelivered, deliveryKeys, type QueueOrder } from '@/lib/admin/deliveries';
import { fetchOrder, orderKeys, type OrderShipmentDetail } from '@/lib/orders/api';
import type { HandoverInput } from '@/lib/fulfilment/handover';
import { getApiErrorMessage } from '@/lib/apiErrors';
import StatusBadge from '@/components/admin/StatusBadge';
import QueryState from '@/components/admin/QueryState';
import HandoverDialog from '@/components/delivery/HandoverDialog';
import { formatDateTimeIST } from '@/lib/dates';

/** One dispatched order; expands to its shipments with an admin "Confirm delivery" (C-26). */
export default function DispatchedOrderRow({ order }: { order: QueueOrder }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OrderShipmentDetail | null>(null);
  const [error, setError] = useState('');
  const detail = useQuery({ queryKey: orderKeys.one(order.id), queryFn: () => fetchOrder(order.id), enabled: open });

  const confirm = useMutation({
    mutationFn: ({ id, h }: { id: string; h: HandoverInput }) => adminMarkDelivered(id, h),
    onSuccess: () => {
      toast.success('Delivery confirmed');
      setTarget(null);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not confirm delivery')),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.one(order.id) });
      queryClient.invalidateQueries({ queryKey: deliveryKeys.dispatched });
    },
  });

  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="card p-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="font-medium">{order.order_number}</span>
        <span className="text-gray-500 flex-1">{order.customer_name ?? '—'}</span>
        <span className="text-xs text-gray-400">{formatDateTimeIST(order.created_at)}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          <QueryState isLoading={detail.isLoading} error={detail.error} isEmpty={false} emptyText="" />
          <ul className="divide-y divide-gray-100 text-sm">
            {detail.data?.shipments.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{s.seller_name ?? s.seller_type}</p>
                  <p className="text-xs text-gray-500">
                    {s.courier_partner ?? '—'} · AWB {s.awb_number ?? '—'} · Seal {s.seal_number ?? '—'}
                    {s.handover_code_required ? ' · code required' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {s.status === 'dispatched' && (
                    <button
                      onClick={() => {
                        setError('');
                        setTarget(s);
                      }}
                      className="btn-outline text-xs py-1.5 px-3"
                    >
                      Confirm delivery
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {target && (
        <HandoverDialog
          title={`Deliver ${order.order_number}`}
          codeRequired={target.handover_code_required}
          allowOverride
          pending={confirm.isPending}
          error={error}
          onClose={() => setTarget(null)}
          onConfirm={(h) => confirm.mutate({ id: target.id, h })}
        />
      )}
    </div>
  );
}
