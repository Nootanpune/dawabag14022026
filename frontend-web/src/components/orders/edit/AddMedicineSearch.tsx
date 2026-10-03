'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Search } from 'lucide-react';
import { searchProducts, TYPEAHEAD_MIN_CHARS, type SearchProduct } from '@/lib/search/api';
import { formatPrice } from '@/lib/utils';

interface Props {
  /** products already on the order (change their quantity instead) or already added */
  exclude: string[];
  onAdd: (p: SearchProduct) => void;
  pincode?: string | null;
}

/** Search the catalogue and add a medicine to the order (Sprint 44). The server checks everything again. */
export default function AddMedicineSearch({ exclude, onAdd, pincode }: Props) {
  const [q, setQ] = useState('');
  const term = q.trim();
  const { data, isFetching } = useQuery({
    queryKey: ['order-edit', 'search', term, pincode],
    queryFn: () => searchProducts({ q: term, limit: 6, pincode }),
    enabled: term.length >= TYPEAHEAD_MIN_CHARS,
    staleTime: 30_000,
  });
  const results = (data?.products ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="font-medium text-gray-800">Add a medicine</span>
        <span className="relative block mt-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search medicines, e.g. cetirizine"
            aria-label="Search medicines to add" />
        </span>
      </label>
      {isFetching && <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Searching…</p>}
      {term.length >= TYPEAHEAD_MIN_CHARS && !isFetching && results.length === 0 && <p className="text-xs text-gray-500">No medicine found to add.</p>}
      <ul className="divide-y divide-gray-100">
        {results.map((p) => (
          <li key={p.id} className="py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <p className="text-xs text-gray-500">
                {formatPrice(p.display_price_paise)}{['Schedule H', 'Schedule H1'].includes(p.drug_schedule) ? ' · prescription needed' : ''}
                {!p.in_stock ? ' · out of stock' : ''}
              </p>
            </div>
            <button type="button" className="btn-outline text-xs inline-flex items-center gap-1" disabled={!p.in_stock}
              onClick={() => { onAdd(p); setQ(''); }} aria-label={`Add ${p.name}`}>
              <Plus className="w-3 h-3" aria-hidden="true" /> Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
