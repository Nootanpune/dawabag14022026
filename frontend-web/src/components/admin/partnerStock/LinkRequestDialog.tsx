'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { fetchAdminProducts } from '@/lib/admin/products';
import { linkProductRequest, type ProductRequest } from '@/lib/admin/partnerStock';
import { formatPrice } from '@/lib/utils';
import Modal from '@/components/admin/Modal';

/** Link a partner's requested item to the catalogue product created (or found) for it. */
export default function LinkRequestDialog({ request, onClose, onDone }: { request: ProductRequest; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(request.item_name.split(/\s+/)[0] ?? '');
  const [q, setQ] = useState(text);
  const list = useQuery({ queryKey: ['admin', 'products', q, 1], queryFn: () => fetchAdminProducts(q, 1, 10), enabled: q.length >= 2 });
  const link = useMutation({ mutationFn: (productId: string) => linkProductRequest(request.id, productId), onSuccess: onDone });
  const submit = (e: FormEvent) => { e.preventDefault(); setQ(text.trim()); };

  return (
    <Modal title="Link to a catalogue product" onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <p className="bg-gray-50 rounded-lg p-3">
          <strong>{request.item_name}</strong> · {[request.pack, request.manufacturer, request.mrp_paise != null ? `MRP ${formatPrice(request.mrp_paise)}` : null]
            .filter(Boolean).join(' · ')} — {request.partner_name}
        </p>
        <form onSubmit={submit} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} className="input" aria-label="Search products" />
          <button className="btn-outline text-sm inline-flex items-center gap-1" type="submit"><Search className="w-4 h-4" /> Search</button>
        </form>
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {(list.data?.products ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1">{p.name} <span className="text-xs text-gray-400">{p.sku}</span></span>
              <button onClick={() => link.mutate(p.id)} disabled={link.isPending} className="btn-primary text-xs py-1.5 px-3">Link</button>
            </li>
          ))}
        </ul>
        {list.data && !list.data.products.length && <p className="text-xs text-gray-500">No product found. Create it first from Products → New.</p>}
        {link.error && <p className="text-xs text-red-600">{getApiErrorMessage(link.error, 'Could not link')}</p>}
      </div>
    </Modal>
  );
}
