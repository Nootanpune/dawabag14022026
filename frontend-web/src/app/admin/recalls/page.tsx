'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchRecalls, recallKeys, type RecallResult } from '@/lib/recalls/api';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import RecallTable from '@/components/admin/recalls/RecallTable';
import NewRecallDialog from '@/components/admin/recalls/NewRecallDialog';
import RecallResultNotice from '@/components/admin/recalls/RecallResultNotice';

// Batch recalls (C-28)
export default function AdminRecallsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: recallKeys.list, queryFn: fetchRecalls });
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<RecallResult | null>(null);

  return (
    <div>
      <PageHeader
        title="Batch recalls"
        subtitle="Block a recalled batch across Dawabag and partner stock and notify buyers"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Recall a batch
          </button>
        }
      />
      {result && <RecallResultNotice r={result} onDismiss={() => setResult(null)} />}
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No batches have been recalled" />
      {!!data?.length && <RecallTable rows={data} />}
      {creating && (
        <NewRecallDialog
          onClose={() => setCreating(false)}
          onDone={(r) => {
            setCreating(false);
            setResult(r);
          }}
        />
      )}
    </div>
  );
}
