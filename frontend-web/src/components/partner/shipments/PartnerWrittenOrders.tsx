'use client';
import { FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { writtenOrderLink } from '@/lib/practitioner/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

/**
 * Sprint 44: a doctor / institution order — your pharmacist checks the signed written order
 * before releasing (Drugs Rules r.65(9)(b); FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1).
 */
export default function PartnerWrittenOrders({ ids }: { ids: string[] }) {
  const open = async (id: string) => {
    try { window.open(await writtenOrderLink(id), '_blank', 'noopener'); } catch (err) { toast.error(getApiErrorMessage(err, 'Could not open the written order')); }
  };
  if (!ids.length) {
    return <p role="alert" className="text-xs rounded-lg bg-red-50 border border-red-200 p-2 mt-3">Doctor / institution order without a signed written order — do not supply.</p>;
  }
  return (
    <div className="text-xs rounded-lg bg-gray-50 border border-gray-200 p-2 mt-3">
      <p className="font-semibold flex items-center gap-1"><FileSignature className="w-3 h-3" aria-hidden="true" /> Doctor / institution order — check the signed written order</p>
      {ids.map((id, n) => (
        <button key={id} type="button" className="block text-brand-700 hover:underline" onClick={() => open(id)}>Open written order{ids.length > 1 ? ` ${n + 1}` : ''}</button>
      ))}
    </div>
  );
}
