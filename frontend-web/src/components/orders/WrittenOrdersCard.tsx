'use client';
import { FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderDetail } from '@/lib/orders/api';
import { writtenOrderLink } from '@/lib/practitioner/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';

/** A doctor / institution order's signed written order(s) (Sprint 44; Drugs Rules r.65(9)(b)). */
export default function WrittenOrdersCard({ order }: { order: OrderDetail }) {
  const list = order.written_orders ?? [];
  if (!list.length) return null;
  const open = async (id: string) => {
    try { window.open(await writtenOrderLink(id), '_blank', 'noopener'); }
    catch (err) { toast.error(getApiErrorMessage(err, 'Could not open the written order')); }
  };
  return (
    <div className="card mb-4 text-sm" data-testid="written-orders">
      <h3 className="font-semibold mb-2 flex items-center gap-2"><FileSignature className="w-4 h-4 text-brand-700" aria-hidden="true" /> Signed written order</h3>
      <ul className="space-y-1">
        {list.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>{w.kind === 'upload' ? 'Uploaded requisition' : 'Signed in the app'} · {formatDateTimeIST(w.signed_at)}{w.order_edit_id ? ' (for a change)' : ''}</span>
            <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => open(w.id)}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
