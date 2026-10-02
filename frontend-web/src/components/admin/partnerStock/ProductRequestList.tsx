'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateIST } from '@/lib/dates';
import { rejectProductRequest, type ProductRequest } from '@/lib/admin/partnerStock';
import { formatPrice } from '@/lib/utils';
import ReasonDialog from '@/components/admin/ReasonDialog';
import LinkRequestDialog from './LinkRequestDialog';

/** Items partners stock that are not in the catalogue yet. */
export default function ProductRequestList({ requests, open }: { requests: ProductRequest[]; open: boolean }) {
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState<ProductRequest | null>(null);
  const [rejecting, setRejecting] = useState<ProductRequest | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'partner-product-requests'] });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectProductRequest(id, reason),
    onSuccess: () => { setRejecting(null); toast.success('Request closed'); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not close the request')),
  });

  return (
    <>
      {open && (
        <p className="text-xs text-gray-600 mb-3">
          Create each product from <Link href="/admin/products/new" className="underline">Products → New</Link> (schedule, generic name, HSN,
          cold chain; the pharmacist reviews the copy, C-19; Schedule X / NDPS are never listed, C-10), then link the request here.
          The partner&apos;s next upload matches it automatically.
        </p>
      )}
      <ul className="card p-0 divide-y divide-gray-100">
        {requests.map((r) => (
          <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium">{r.item_name}</p>
              <p className="text-xs text-gray-500">
                {[r.partner_name, r.pack && `Pack ${r.pack}`, r.manufacturer && `Co. ${r.manufacturer}`, r.gst_rate != null && `GST ${Number(r.gst_rate)}%`,
                  r.mrp_paise != null && `MRP ${formatPrice(r.mrp_paise)}`, `asked ${formatDateIST(r.requested_at)}`].filter(Boolean).join(' · ')}
              </p>
              {r.product_name && <p className="text-xs text-green-700">Linked to {r.product_name}</p>}
              {r.resolution_note && <p className="text-xs text-gray-500">Closed: {r.resolution_note}</p>}
            </div>
            {open && (
              <div className="flex gap-2">
                <button onClick={() => setLinking(r)} className="btn-primary text-xs py-1.5 px-3">Link product</button>
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
