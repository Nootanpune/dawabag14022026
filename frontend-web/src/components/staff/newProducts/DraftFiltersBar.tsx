'use client';
import type { DraftFilters, DraftList } from '@/lib/admin/catalogueDrafts';

/** Filters: company, needs a schedule, cold chain, name. */
export default function DraftFiltersBar({ filters, companies, onChange }: {
  filters: DraftFilters;
  companies: DraftList['companies'];
  onChange: (f: Partial<DraftFilters>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 mb-3" role="search" aria-label="Filter new products">
      <div className="text-xs">
        <label htmlFor="drafts-company" className="block text-gray-700">Company</label>
        <select id="drafts-company" value={filters.company} onChange={(e) => onChange({ company: e.target.value })} className="input text-sm py-1.5">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.company} value={c.company}>{c.company} ({c.n})</option>)}
        </select>
      </div>
      <div className="text-xs">
        <label htmlFor="drafts-cold" className="block text-gray-700">Cold chain</label>
        <select id="drafts-cold" value={filters.cold_chain} onChange={(e) => onChange({ cold_chain: e.target.value as DraftFilters['cold_chain'] })}
          className="input text-sm py-1.5">
          <option value="">Any</option>
          <option value="undecided">Not decided yet</option>
          <option value="yes">Yes, 2–8 °C</option>
          <option value="no">No</option>
        </select>
      </div>
      <div className="text-xs flex-1 min-w-[10rem]">
        <label htmlFor="drafts-q" className="block text-gray-700">Name</label>
        <input id="drafts-q" type="search" value={filters.q} onChange={(e) => onChange({ q: e.target.value })} className="input text-sm py-1.5" />
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2">
        <input type="checkbox" checked={filters.needs_schedule} onChange={(e) => onChange({ needs_schedule: e.target.checked })} className="w-4 h-4" />
        Needs schedule
      </label>
    </div>
  );
}
