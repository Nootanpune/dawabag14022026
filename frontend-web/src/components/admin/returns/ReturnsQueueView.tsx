'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchStaffReturns, returnKeys, returnReasonLabel, type ReturnStatus } from '@/lib/returns/api';
import { formatPrice } from '@/lib/utils';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateTimeIST } from '@/lib/dates';

const TABS: { value: ReturnStatus; label: string }[] = [
  { value: 'requested', label: 'To decide' },
  { value: 'approved', label: 'Approved — collect & dispose' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' },
];

/** Staff returns queue (C-37); `basePath` is /admin/returns or /staff/returns. */
export default function ReturnsQueueView({ basePath }: { basePath: string }) {
  const [status, setStatus] = useState<ReturnStatus>('requested');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: returnKeys.staff(status),
    queryFn: () => fetchStaffReturns(status),
  });
  return (
    <div>
      <PageHeader
        title="Returns"
        subtitle="Approve or reject buyer returns; returned medicines are destroyed or sent to the supplier, never restocked"
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No returns here" />
      {!!data?.length && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr className="text-left">
                <th className="font-medium px-4 py-2.5">Return</th>
                <th className="font-medium px-4 py-2.5">Reason</th>
                <th className="font-medium px-4 py-2.5">Seller</th>
                <th className="font-medium px-4 py-2.5">Buyer</th>
                <th className="font-medium px-4 py-2.5 text-right">Refund</th>
                <th className="font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`${basePath}/${r.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                      {r.return_no}
                    </Link>
                    <p className="text-xs text-gray-400">
                      {r.order_number} · {formatDateTimeIST(r.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{returnReasonLabel(r.reason)}</td>
                  <td className="px-4 py-2.5 text-xs">{r.seller_type === 'dawabag' ? 'Dawabag' : r.partner_name ?? 'Partner'}</td>
                  <td className="px-4 py-2.5 text-xs">{r.buyer_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{r.refund_paise > 0 ? formatPrice(r.refund_paise) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
