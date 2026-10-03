'use client';
import { useQuery } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { writtenOrderLink } from '@/lib/practitioner/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';

/**
 * For the pharmacist checking a doctor / institution order (Sprint 44): the signed written order
 * to look at before release (Drugs Rules r.65(9)(b)) — the pharmacist is the competent person
 * supervising the sale (r.64(2)).
 */
export default function WrittenOrderNote({ orderId, count }: { orderId: string; count: number }) {
  const { data } = useQuery({
    queryKey: ['fulfilment', 'check-detail', orderId],
    queryFn: async () => (await api.get(`/fulfilment/checks/${orderId}`)).data.data as { written_orders: { id: string; kind: string; signed_at: string }[] },
    enabled: count > 0,
  });
  const open = async (id: string) => {
    try { window.open(await writtenOrderLink(id), '_blank', 'noopener'); } catch (err) { toast.error(getApiErrorMessage(err, 'Could not open the written order')); }
  };
  if (!count) {
    return <p role="alert" className="text-xs rounded-lg bg-red-50 border border-red-200 p-2 mb-3">No signed written order is attached — this order cannot be supplied (r.65(9)(b)).</p>;
  }
  return (
    <div className="text-xs rounded-lg bg-gray-50 border border-gray-200 p-2 mb-3" data-testid="written-order-note">
      <p className="font-semibold flex items-center gap-1"><FileSignature className="w-3 h-3" aria-hidden="true" /> Doctor / institution order — check the signed written order</p>
      <ul className="mt-1 space-y-0.5">
        {(data?.written_orders ?? []).map((w) => (
          <li key={w.id}>
            {w.kind === 'upload' ? 'Uploaded signed requisition' : 'Signed in the app'} · {formatDateTimeIST(w.signed_at)}{' '}
            <button type="button" className="text-brand-700 hover:underline" onClick={() => open(w.id)}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
