'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { recallKeys, searchProducts, type ProductHit } from '@/lib/recalls/api';
import { scheduleBadge } from '@/lib/drugSchedule';

interface Props {
  value: ProductHit | null;
  onChange: (p: ProductHit | null) => void;
}

/** Search the catalogue (GET /products/search) and pick the product being recalled. */
export default function ProductPicker({ value, onChange }: Props) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: recallKeys.productSearch(q),
    queryFn: () => searchProducts(q),
    enabled: q.length >= 2 && !value,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
        <span>
          <span className="font-medium">{value.name}</span>
          <span className="text-xs text-gray-400">
            {' '}
            · {value.sku}
            {scheduleBadge(value.drug_schedule) ? ` · ${scheduleBadge(value.drug_schedule)}` : ''}
          </span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Change product">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name, generic or SKU" className="input" autoFocus />
        {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-300 absolute right-3 top-3" />}
      </div>
      {q.length >= 2 && data && (
        <ul className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
          {data.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                <span className="font-medium">{p.name}</span>
                <span className="block text-xs text-gray-400">
                  {p.generic_name ?? ''} · {p.sku}
                </span>
              </button>
            </li>
          ))}
          {!data.length && <li className="px-3 py-2 text-xs text-gray-400">No products found</li>}
        </ul>
      )}
    </div>
  );
}
