'use client';
import { useQuery } from '@tanstack/react-query';
import Modal from '@/components/admin/Modal';
import QueryState from '@/components/admin/QueryState';
import { formatDateTimeIST } from '@/lib/dates';
import { ONLINE_SALE_LABELS, fetchOnlineSaleLog, onlineSaleKeys } from '@/lib/onlineSale/api';

/** The product's append-only online-sale history (C-46). */
export default function HistoryDialog({ product, onClose }: { product: { id: string; name: string }; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: onlineSaleKeys.log(product.id), queryFn: () => fetchOnlineSaleLog(product.id) });
  return (
    <Modal title={`History: ${product.name}`} onClose={onClose} size="lg">
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No changes recorded." />
      <ol className="space-y-2 text-sm">
        {data?.map((l, i) => (
          <li key={i} className="border-b border-gray-100 pb-2">
            <p className="font-medium">{l.old_status ? `${ONLINE_SALE_LABELS[l.old_status]} → ` : ''}{ONLINE_SALE_LABELS[l.new_status]}</p>
            <p className="text-xs text-gray-600">{formatDateTimeIST(l.set_at)}{l.set_by_name ? ` · ${l.set_by_name}` : ''}</p>
            {l.notification_ref && <p className="text-xs">Reference: {l.notification_ref}{l.notification_date ? ` (${l.notification_date})` : ''}</p>}
            {l.reason && <p className="text-xs text-gray-700">{l.reason}</p>}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
