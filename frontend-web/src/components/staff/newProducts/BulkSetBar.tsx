'use client';
import { useState } from 'react';
import { BULK_FIELDS, type BulkKey } from '@/lib/admin/catalogueDrafts';
import { useBulkSet } from './useDraftActions';

/** "Set for all chosen": non-clinical details only. The schedule is never set in bulk. */
export default function BulkSetBar({ ids, onDone, onClear }: { ids: string[]; onDone: () => void; onClear: () => void }) {
  const [key, setKey] = useState<BulkKey>('category');
  const [value, setValue] = useState('');
  const bulk = useBulkSet(() => { setValue(''); onDone(); });
  if (!ids.length) return null;
  const list = key === 'category' ? 'draft-categories' : key === 'hsn_code' ? 'draft-hsn' : undefined;

  return (
    <form
      className="sticky top-0 z-10 bg-brand-50 border border-brand-200 rounded-lg p-2 mb-3 flex flex-wrap items-end gap-2"
      aria-label="Set for all chosen"
      onSubmit={(e) => { e.preventDefault(); bulk.mutate({ ids, key, value: value.trim() || null }); }}
    >
      <p className="text-sm font-medium w-full sm:w-auto">{ids.length} chosen — set for all:</p>
      <div className="text-xs">
        <label htmlFor="bulk-key" className="block text-gray-700">Detail</label>
        <select id="bulk-key" value={key} onChange={(e) => setKey(e.target.value as BulkKey)} className="input text-sm py-1.5">
          {BULK_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>
      <div className="text-xs flex-1 min-w-[10rem]">
        <label htmlFor="bulk-value" className="block text-gray-700">Value</label>
        <input id="bulk-value" value={value} onChange={(e) => setValue(e.target.value)} list={list} className="input text-sm py-1.5" />
      </div>
      <button type="submit" disabled={bulk.isPending} className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50">Set</button>
      <button type="button" onClick={onClear} className="btn-outline text-sm py-1.5 px-3">Clear choice</button>
      <p className="text-[11px] text-gray-600 w-full">The schedule and clinical details are decided one product at a time.</p>
    </form>
  );
}
