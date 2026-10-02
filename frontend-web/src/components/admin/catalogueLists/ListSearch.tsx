'use client';
import { Search } from 'lucide-react';

/** Search box above a list; the server searches every entry, switched-off ones too. */
export default function ListSearch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative block max-w-sm mb-3">
      <span className="sr-only">{label}</span>
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label}
        className="input pl-9 w-full" />
    </label>
  );
}
