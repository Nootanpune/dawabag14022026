'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateIST } from '@/lib/dates';
import { rejectProductRequest, type ProductRequest } from '@/lib/admin/partnerStock';
import type { DraftsCreated } from '@/lib/admin/catalogueDrafts';
import { formatPrice } from '@/lib/utils';
import ReasonDialog from '@/components/admin/ReasonDialog';
import LinkRequestDialog from './LinkRequestDialog';
import CreateDraftsBar from './CreateDraftsBar';

/** Items partners stock that are not in the catalogue yet. Open ones can be linked one by one,
 *  closed, or turned into draft products in bulk for the pharmacist (Sprint 29). */
export default function ProductRequestList({ requests, open, onDraftsCreated }: {
  requests: ProductRequest[];
  open: boolean;
  onDraftsCreated: (r: DraftsCreated) => void;
}) {
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState<ProductRequest | null>(null);
  const [rejecting, setRejecting] = useState<ProductRequest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'partner-product-requests'] });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectProductRequest(id, reason),
    onSuccess: () => { setRejecting(null); toast.success('Request closed'); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not close the request')),
  });
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allChosen = requests.length > 0 && requests.every((r) => selected.has(r.id));

  return (
    <>
      {open && (
        <>
          <p className="text-xs text-gray-600 mb-3">
            Choose requests and <strong>Create drafts</strong>: each becomes a draft product (not on sale) filled in only from the
            partner&apos;s file. A pharmacist completes it in{' '}
            <Link href="/staff/new-products" className="underline">New products to complete</Link> (schedule, generic name, HSN, cold
            chain, copy — C-19; Schedule X / NDPS are never listed, C-10). Or create one product from{' '}
            <Link href="/admin/products/new" className="underline">Products → New</Link> and link it.
          </p>
          <CreateDraftsBar
            selectedIds={[...selected]}
            openCount={requests.length}
            allChosen={allChosen}
            onToggleAll={() => setSelected(allChosen ? new Set() : new Set(requests.map((r) => r.id)))}
            onDone={(r) => { setSelected(new Set()); onDraftsCreated(r); refresh(); }}
          />
        </>
      )}
      <ul className="card p-0 divide-y divide-gray-100" aria-label="Partner product requests">
        {requests.map((r) => (
          <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            {open && (
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4"
                aria-label={`Choose ${r.item_name}`} />
            )}
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium break-words">{r.item_name}</p>
              <p className="text-xs text-gray-500">
                {[r.partner_name, r.pack && `Pack ${r.pack}`, r.manufacturer && `Co. ${r.manufacturer}`, r.gst_rate != null && `GST ${Number(r.gst_rate)}%`,
                  r.mrp_paise != null && `MRP ${formatPrice(r.mrp_paise)}`, `asked ${formatDateIST(r.requested_at)}`].filter(Boolean).join(' · ')}
              </p>
              {r.product_name && r.status === 'drafted' && <p className="text-xs text-amber-700">Draft: {r.product_name} — waiting for the pharmacist</p>}
              {r.product_name && r.status === 'linked' && <p className="text-xs text-green-700">Linked to {r.product_name}</p>}
              {r.resolution_note && <p className="text-xs text-gray-500">Closed: {r.resolution_note}</p>}
            </div>
            {open && (
              <div className="flex gap-2">
                <button onClick={() => setLinking(r)} className="btn-outline text-xs py-1.5 px-3">Link product</button>
                <button onClick={() => setRejecting(r)} className="btn-outline text-xs py-1.5 px-3">Close</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {linking && (
        <LinkRequestDialog request={linking} onClose={() => setLinking(null)}
          onDone={() => { setLinking(null); toast.success('Linked'); refresh(); }} />
      )}
      {rejecting && (
        <ReasonDialog title="Close this request" label="Why can it not be added?" confirmLabel="Close request" pending={reject.isPending}
          onClose={() => setRejecting(null)} onConfirm={(reason) => reject.mutate({ id: rejecting.id, reason })} />
      )}
    </>
  );
}
