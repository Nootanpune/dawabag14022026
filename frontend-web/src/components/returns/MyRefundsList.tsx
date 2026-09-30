'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchMyRefunds, returnKeys } from '@/lib/returns/api';
import { REFUND_METHOD_LABELS } from '@/lib/orders/api';
import { formatDateIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import QueryState from '@/components/admin/QueryState';
import StatusBadge from '@/components/admin/StatusBadge';

/** GET /returns/refunds/my — every refund from cancellations and returns (C-37). */
export default function MyRefundsList() {
  const { data, isLoading, error } = useQuery({ queryKey: returnKeys.myRefunds, queryFn: fetchMyRefunds });
  return (
    <div className="card">
      <h2 className="font-semibold text-sm mb-2">Refunds</h2>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No refunds yet." />
      <ul className="divide-y divide-gray-100 text-sm">
        {data?.map((r) => (
          <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link href={`/orders/${r.order_id}`} className="text-brand-700 hover:underline">
                {r.order_number}
              </Link>
              <p className="text-xs text-gray-500">
                {REFUND_METHOD_LABELS[r.method] ?? r.method} · {r.source} · {formatDateIST(r.processed_at ?? r.created_at)}
              </p>
            </div>
            <span className="flex items-center gap-2">
              {formatPrice(r.amount_paise)} <StatusBadge status={r.status} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
