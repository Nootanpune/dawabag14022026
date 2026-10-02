'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  fetchImportRows, linkImportRow, requestNewProducts, stockImportKeys,
  type ImportRow, type ImportSummary, type RowTab,
} from '@/lib/partner/stockImport';
import StatusTabs from '@/components/admin/StatusTabs';
import Pager from '@/components/admin/Pager';
import QueryState from '@/components/admin/QueryState';
import ImportRowCard from './ImportRowCard';
import LinkProductDialog from './LinkProductDialog';

const EMPTY: Record<RowTab, string> = {
  matched: 'No line is ready yet',
  needs_review: 'Nothing needs your review',
  problem: 'No problems found',
  skipped: 'No lines were ignored',
};

/** Matched / Needs review / Problems / Ignored, paged from the server. */
export default function ImportRowList({ importId, summary, editable }: { importId: string; summary: ImportSummary; editable: boolean }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<RowTab>(summary.needs_review ? 'needs_review' : 'matched');
  const [page, setPage] = useState(1);
  const [choosing, setChoosing] = useState<ImportRow | null>(null);
  const rows = useQuery({ queryKey: stockImportKeys.rows(importId, tab, page), queryFn: () => fetchImportRows(importId, tab, page) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: stockImportKeys.one(importId) });
  const request = useMutation({
    mutationFn: (rowIds?: string[]) => requestNewProducts(importId, rowIds),
    onSuccess: (r) => { toast.success(`${r.items} item${r.items === 1 ? '' : 's'} sent to Dawabag to add to the catalogue`); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not send the request')),
  });
  const unlink = useMutation({
    mutationFn: (row: ImportRow) => linkImportRow(importId, row.id, null),
    onSuccess: () => { toast.success('Link removed'); refresh(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not remove the link')),
  });

  const tabs = [
    { value: 'matched' as const, label: `Matched (${summary.matched})` },
    { value: 'needs_review' as const, label: `Needs review (${summary.needs_review})` },
    { value: 'problem' as const, label: `Problems (${summary.problem})` },
    { value: 'skipped' as const, label: `Ignored (${summary.skipped})` },
  ];
  const unrequested = summary.needs_review - summary.requested;

  return (
    <section>
      <StatusTabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); setPage(1); }} />
      {tab === 'needs_review' && (
        <p className="text-xs text-gray-600 mb-3">
          These items did not match one Dawabag product exactly. Choose the right product (we remember it for next time), or ask
          Dawabag to add it: our pharmacist sets its schedule, generic name and details before it can be sold.
        </p>
      )}
      {tab === 'needs_review' && editable && unrequested > 0 && (
        <button onClick={() => request.mutate(undefined)} disabled={request.isPending} className="btn-outline text-sm mb-3 w-full sm:w-auto">
          Request all {unrequested} unmatched lines as new products
        </button>
      )}
      {tab === 'problem' && (
        <p className="text-xs text-gray-600 mb-3">These lines are left out. Correct them in your billing software and upload a new file.</p>
      )}
      {tab === 'skipped' && <p className="text-xs text-gray-600 mb-3">Totals, headings and footer lines in the report — not stock.</p>}
      <QueryState isLoading={rows.isLoading} error={rows.error} isEmpty={!rows.data?.rows.length} emptyText={EMPTY[tab]} />
      {!!rows.data?.rows.length && (
        <>
          <ul className="card p-0 divide-y divide-gray-100">
            {rows.data.rows.map((r) => (
              <ImportRowCard key={r.id} row={r} editable={editable} onChoose={setChoosing}
                onRequest={(row) => request.mutate([row.id])} onUnlink={(row) => unlink.mutate(row)} />
            ))}
          </ul>
          <Pager page={page} limit={rows.data.limit} total={rows.data.total} onPage={setPage} />
        </>
      )}
      {choosing && (
        <LinkProductDialog importId={importId} row={choosing} onClose={() => setChoosing(null)}
          onLinked={() => { setChoosing(null); toast.success('Linked — we will remember this item'); refresh(); }} />
      )}
    </section>
  );
}
