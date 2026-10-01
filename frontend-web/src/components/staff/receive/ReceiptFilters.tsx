'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSuppliers, purchasingKeys } from '@/lib/purchasing/api';
import type { ReceiptFilter } from '@/lib/purchasing/types';

type Patch = Partial<Pick<ReceiptFilter, 'from' | 'to' | 'vendor_id' | 'q'>>;

/** Supplier, GRN / invoice search and date range for the goods receipts list. */
export default function ReceiptFilters({ value, onChange }: { value: ReceiptFilter; onChange: (patch: Patch) => void }) {
  // every supplier, including inactive ones, so older receipts stay findable
  const suppliers = useQuery({ queryKey: purchasingKeys.suppliers, queryFn: fetchSuppliers });
  const [text, setText] = useState(value.q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== value.q) onChange({ q: text.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [text, value.q, onChange]);

  return (
    <div className="card flex flex-wrap items-end gap-3 text-sm mb-3">
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Search</span>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={60} placeholder="GRN or supplier invoice no." className="input" />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Supplier</span>
        <select value={value.vendor_id} onChange={(e) => onChange({ vendor_id: e.target.value })} className="input" disabled={suppliers.isLoading}>
          <option value="">{suppliers.isLoading ? 'Loading…' : 'All suppliers'}</option>
          {suppliers.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">From</span>
        <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ from: e.target.value })} className="input" />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">To</span>
        <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ to: e.target.value })} className="input" />
      </label>
    </div>
  );
}
