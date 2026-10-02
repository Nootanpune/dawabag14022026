'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCheckQueue, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { CheckQueueItem } from '@/lib/fulfilment/types';
import { CUSTOMER_TYPE_SHORT } from '@/lib/admin/format';
import { formatDateTimeIST } from '@/lib/dates';
import QueryState from '@/components/admin/QueryState';
import CheckDialog from './CheckDialog';
import CheckLinesTable from './CheckLinesTable';

/** Orders (Dawabag's own shipments) waiting for the pharmacist before packing — Sprint 35, C-08. */
export default function CheckQueue() {
  const { data, isLoading, error } = useQuery({ queryKey: fulfilmentKeys.queue('check'), queryFn: fetchCheckQueue, refetchInterval: 60000 });
  const [open, setOpen] = useState<CheckQueueItem | null>(null);
  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No orders waiting for the pharmacist check" />
      <div className="space-y-3">
        {data?.map((item) => (
          <div key={item.shipment_id} className="card" data-testid="check-card">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-semibold">
                  {item.order_number}
                  {item.pharmacist_check === 'held' && <span className="ml-2 text-xs rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">On hold</span>}
                  {item.signals.length > 0 && <span className="ml-2 text-xs rounded-full bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5">{item.signals.length} to look at</span>}
                </p>
                <p className="text-xs text-gray-600">
                  {item.buyer_name ?? '—'} · {CUSTOMER_TYPE_SHORT[item.customer_type] ?? item.customer_type} · placed {formatDateTimeIST(item.created_at)}
                </p>
                {item.pharmacist_check === 'held' && item.pharmacist_check_note && (
                  <p className="text-xs text-gray-700 mt-0.5">On hold: {item.pharmacist_check_note}</p>
                )}
              </div>
              <button onClick={() => setOpen(item)} className="btn-primary text-xs py-1.5 px-3">Check order</button>
            </div>
            <CheckLinesTable lines={item.lines} />
          </div>
        ))}
      </div>
      {open && <CheckDialog item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
