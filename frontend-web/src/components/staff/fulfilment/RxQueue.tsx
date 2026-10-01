'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { fetchRxQueue, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { QueuePrescription, RxQueueItem } from '@/lib/fulfilment/types';
import { CUSTOMER_TYPE_SHORT } from '@/lib/admin/format';
import QueryState from '@/components/admin/QueryState';
import StatusBadge from '@/components/admin/StatusBadge';
import RxReviewDialog from './RxReviewDialog';
import ApplyRxDialog from './ApplyRxDialog';
import OfferedRxNotice from './OfferedRxNotice';
import { formatDateTimeIST } from '@/lib/dates';

/** Orders waiting for a pharmacist's prescription decision (C-08). */
export default function RxQueue() {
  const { data, isLoading, error } = useQuery({ queryKey: fulfilmentKeys.queue('rx'), queryFn: fetchRxQueue, refetchInterval: 60000 });
  const [review, setReview] = useState<{ item: RxQueueItem; rx: QueuePrescription } | null>(null);
  const [applying, setApplying] = useState<RxQueueItem | null>(null);

  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No orders waiting for prescription review" />
      <div className="space-y-3">
        {data?.map((item) => (
          <div key={item.order_id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{item.order_number}</p>
                <p className="text-xs text-gray-500">
                  {item.buyer_name ?? '—'} · {CUSTOMER_TYPE_SHORT[item.customer_type] ?? item.customer_type} · placed{' '}
                  {formatDateTimeIST(item.created_at)}
                </p>
              </div>
              <button onClick={() => setApplying(item)} className="btn-outline text-xs py-1.5 px-3">
                Use existing prescription
              </button>
            </div>
            {item.requested_prescription_id && (
              <OfferedRxNotice item={{ ...item, requested_prescription_id: item.requested_prescription_id }} />
            )}
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {(item.prescriptions ?? []).map((rx) => (
                <li key={rx.prescription_id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    {(rx.file_type ?? 'file').toUpperCase()} uploaded {formatDateTimeIST(rx.uploaded_at)}
                    <StatusBadge status={rx.status} />
                  </span>
                  {rx.status === 'pending' && (
                    <button onClick={() => setReview({ item, rx })} className="btn-primary text-xs py-1.5 px-3">
                      Review
                    </button>
                  )}
                </li>
              ))}
              {!item.prescriptions?.length && !item.requested_prescription_id && (
                <li className="py-2 text-xs text-gray-500">No prescription uploaded for this order yet.</li>
              )}
            </ul>
          </div>
        ))}
      </div>
      {review && <RxReviewDialog item={review.item} prescription={review.rx} onClose={() => setReview(null)} />}
      {applying && <ApplyRxDialog item={applying} onClose={() => setApplying(null)} />}
    </div>
  );
}
