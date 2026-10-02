'use client';
import { SEARCH_SORTS, SORT_LABELS, type SearchSort } from '@/lib/search/api';

/** Sort order of the results (the server sorts; "Best match" is its relevance order). */
export default function SortSelect({ value, onChange }: { value: SearchSort; onChange: (s: SearchSort) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <span>Sort by</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SearchSort)}
        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        {SEARCH_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
      </select>
    </label>
  );
}
