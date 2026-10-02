'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import { partnerKeys } from '@/lib/partner/api';
import { cancelStockImport, fetchStockImport, recheckImport, stockImportKeys, STATUS_LABEL } from '@/lib/partner/stockImport';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ImportSteps from '@/components/partner/stockImport/ImportSteps';
import ColumnMapper from '@/components/partner/stockImport/ColumnMapper';
import ImportSummaryTiles from '@/components/partner/stockImport/ImportSummaryTiles';
import ImportRowList from '@/components/partner/stockImport/ImportRowList';
import ApplyDialog from '@/components/partner/stockImport/ApplyDialog';
import ApplyResultCard from '@/components/partner/stockImport/ApplyResultCard';

/** One uploaded stock file: columns → check lines → apply → result. All state comes from the server. */
export default function StockImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editColumns, setEditColumns] = useState(false);
  const [applying, setApplying] = useState(false);
  const imp = useQuery({ queryKey: stockImportKeys.one(id), queryFn: () => fetchStockImport(id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: stockImportKeys.one(id) });
  const recheck = useMutation({ mutationFn: () => recheckImport(id), onSuccess: () => { toast.success('Checked again'); refresh(); } });
  const cancel = useMutation({
    mutationFn: () => cancelStockImport(id),
    onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: stockImportKeys.list }); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not cancel')),
  });

  const d = imp.data;
  const draft = d?.status === 'draft';
  const mapping = !!d && draft && (!d.mapping_confirmed || editColumns);
  const step = !d ? 1 : d.status === 'applied' ? 3 : mapping ? 1 : 2;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Upload stock"
        subtitle={d ? `${d.file_name} · uploaded ${formatDateTimeIST(d.created_at)} · ${STATUS_LABEL[d.status]}` : undefined}
        actions={<Link href="/partner/stock-import" className="btn-outline text-sm">All uploads</Link>}
      />
      <QueryState isLoading={imp.isLoading} error={imp.error} isEmpty={false} emptyText="" />
      {d && (
        <>
          <ImportSteps step={step} />
          {d.same_file_applied_at && draft && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              This is the same file you applied on {formatDateTimeIST(d.same_file_applied_at)}.
            </p>
          )}
          {d.expired && draft && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              This file was uploaded more than a day ago and stock has moved since. Export and upload a fresh file.
            </p>
          )}
          {d.status === 'cancelled' && <p className="text-sm text-gray-600 card">This upload was cancelled. Nothing was changed.</p>}

          {mapping ? (
            <ColumnMapper imp={d} onCancel={d.mapping_confirmed ? () => setEditColumns(false) : undefined}
              onSaved={() => { setEditColumns(false); refresh(); }} />
          ) : (
            <>
              {d.status === 'applied' && d.result && <ApplyResultCard result={d.result} appliedAt={d.applied_at} />}
              {d.summary && <ImportSummaryTiles summary={d.summary} />}
              {draft && d.summary && (
                <div className="card flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <p className="text-sm text-gray-700">
                    {d.summary.matched
                      ? `${d.summary.matched} lines are ready. Review the rest, then apply.`
                      : 'No line is ready yet: link the items below or request them as new products.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setEditColumns(true)} className="btn-outline text-sm">Change columns</button>
                    <button onClick={() => recheck.mutate()} disabled={recheck.isPending} className="btn-outline text-sm">Check again</button>
                    <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="btn-outline text-sm">Cancel upload</button>
                    <button onClick={() => setApplying(true)} disabled={!d.summary.matched || d.expired} className="btn-primary text-sm">
                      Apply stock
                    </button>
                  </div>
                </div>
              )}
              {d.summary && <ImportRowList key={d.status} importId={d.id} summary={d.summary} editable={draft && !d.expired} />}
            </>
          )}
          {applying && d.summary && (
            <ApplyDialog importId={d.id} summary={d.summary} onClose={() => setApplying(false)}
              onApplied={() => {
                setApplying(false);
                toast.success('Stock updated');
                refresh();
                queryClient.invalidateQueries({ queryKey: stockImportKeys.list });
                queryClient.invalidateQueries({ queryKey: partnerKeys.listings });
              }} />
          )}
        </>
      )}
    </div>
  );
}
