'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRecall, recallKeys } from '@/lib/recalls/api';
import { formatDateTimeIST } from '@/lib/admin/format';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import AffectedOrdersTable from '@/components/admin/recalls/AffectedOrdersTable';

export default function AdminRecallPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, isLoading, error, refetch, isFetching } = useQuery({ queryKey: recallKeys.one(id), queryFn: () => fetchRecall(id) });

  return (
    <div>
      <BackLink href="/admin/recalls" label="Batch recalls" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {r && (
        <>
          <PageHeader
            title={`${r.product_name} — batch ${r.batch_number}`}
            subtitle={`Recalled ${formatDateTimeIST(r.recalled_at)}${r.recalled_by_name ? ` by ${r.recalled_by_name}` : ''}`}
            onRefresh={() => refetch()}
            refreshing={isFetching}
          />
          <div className="card mb-4 text-sm">
            <p className="whitespace-pre-wrap">{r.reason}</p>
            {r.source && <p className="text-xs text-gray-500 mt-1">Source: {r.source}</p>}
          </div>
          <h2 className="text-sm font-semibold mb-2">Affected orders ({r.affected.length})</h2>
          <AffectedOrdersTable rows={r.affected} />
        </>
      )}
    </div>
  );
}
