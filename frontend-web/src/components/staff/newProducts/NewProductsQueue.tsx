'use client';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { draftKeys, fetchDraftOptions, fetchDrafts, type DraftFilters } from '@/lib/admin/catalogueDrafts';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import Pager from '@/components/admin/Pager';
import DraftCard from './DraftCard';
import DraftFiltersBar from './DraftFiltersBar';
import BulkSetBar from './BulkSetBar';

const TABS = [
  { value: 'open', label: 'To complete' },
  { value: 'done', label: 'Done' },
] as const;

/** Sprint 29: draft products made from partner requests, completed and approved one row at a time. */
export default function NewProductsQueue() {
  const role = useAuthStore((s) => s.user?.role);
  const [filters, setFilters] = useState<DraftFilters>({ status: 'open', company: '', needs_schedule: false, cold_chain: '', q: '', page: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = useQuery({ queryKey: draftKeys.list(filters), queryFn: () => fetchDrafts(filters), placeholderData: keepPreviousData });
  const options = useQuery({ queryKey: draftKeys.options, queryFn: fetchDraftOptions, staleTime: 300_000 });
  const change = (f: Partial<DraftFilters>) => { setFilters((old) => ({ ...old, page: 1, ...f })); setSelected(new Set()); };
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const progress = list.data?.progress;
  const drafts = list.data?.drafts ?? [];
  const allChosen = drafts.length > 0 && drafts.every((d) => selected.has(d.id));

  return (
    <div>
      <PageHeader
        title="New products to complete"
        subtitle="Draft products made from partners' stock files. Not on sale until a pharmacist approves each one (C-19)."
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
      />
      {progress && (
        <div className="mb-4" data-testid="drafts-progress">
          <p className="text-sm font-medium mb-1">{progress.done} of {progress.total} done</p>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-label="New products done"
            aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-green-600" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} />
          </div>
        </div>
      )}
      <StatusTabs tabs={TABS} value={filters.status} onChange={(status) => change({ status })} />
      <DraftFiltersBar filters={filters} companies={list.data?.companies ?? []} onChange={change} />
      {filters.status === 'open' && drafts.length > 0 && (
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 mb-2">
          <input type="checkbox" checked={allChosen} className="w-4 h-4"
            onChange={() => setSelected(allChosen ? new Set() : new Set(drafts.map((d) => d.id)))} />
          Choose all on this page
        </label>
      )}
      <BulkSetBar ids={[...selected]} onDone={() => setSelected(new Set())} onClear={() => setSelected(new Set())} />
      <QueryState isLoading={list.isLoading} error={list.error} isEmpty={!drafts.length}
        emptyText={filters.status === 'open' ? 'Nothing to complete' : 'Nothing decided yet'} />
      <ul className="space-y-3" aria-label="New products">
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} options={options.data} canApprove={role === 'pharmacist_rx'}
            selected={selected.has(d.id)} onSelect={() => toggle(d.id)} />
        ))}
      </ul>
      {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={(page) => setFilters((f) => ({ ...f, page }))} />}
      <datalist id="draft-categories">{(options.data?.categories ?? []).map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="draft-hsn">{(options.data?.hsn_codes ?? []).map((h) => <option key={h.hsn_code} value={h.hsn_code}>{`${h.n} products`}</option>)}</datalist>
    </div>
  );
}
