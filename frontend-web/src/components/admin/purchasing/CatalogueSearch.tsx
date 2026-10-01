'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hasRole } from '@/lib/admin/roles';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';
import { isNeverStocked, productSearchKeys, searchCatalogue, type CatalogueHit } from '@/lib/purchasing/productSearch';
import { scheduleBadge } from '@/lib/drugSchedule';

interface Props {
  onPick: (p: CatalogueHit) => void;
  /** product ids already on the form (shown disabled) */
  taken?: readonly string[];
  placeholder?: string;
}

/** Type-ahead over the catalogue; picking a product clears the box for the next one. */
export default function CatalogueSearch({ onPick, taken = [], placeholder = 'Add a product: search name or SKU' }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const scope = hasRole(role, PURCHASE_ADMIN_ROLES) ? 'admin' : 'public';
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: productSearchKeys.search(scope, q),
    queryFn: () => searchCatalogue(scope, q),
    enabled: q.length >= 2,
  });

  const pick = (p: CatalogueHit) => {
    onPick(p);
    setText('');
    setQ('');
  };

  return (
    <div className="relative">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="input" />
      {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-300 absolute right-3 top-3" />}
      {q.length >= 2 && data && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow divide-y divide-gray-100 max-h-60 overflow-y-auto">
          {data.map((p) => {
            // Schedule X / NDPS are never stocked for online sale (server refuses them too)
            const blocked = isNeverStocked(p.drug_schedule);
            const dup = taken.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={blocked || dup}
                  onClick={() => pick(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-gray-400">
                    {p.sku}
                    {scheduleBadge(p.drug_schedule) ? ` · ${scheduleBadge(p.drug_schedule)}` : ''}
                    {blocked ? ' · never stocked' : dup ? ' · already added' : ''}
                  </span>
                </button>
              </li>
            );
          })}
          {!data.length && <li className="px-3 py-2 text-xs text-gray-400">No products found</li>}
        </ul>
      )}
    </div>
  );
}
