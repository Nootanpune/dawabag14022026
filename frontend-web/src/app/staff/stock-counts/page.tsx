'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchCounts, stockControlKeys } from '@/lib/stock/api';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import CountTable from '@/components/staff/stock/CountTable';
import StartCountDialog from '@/components/staff/stock/StartCountDialog';

// Cycle counts: one person counts, a different admin approves the variances (C-46).
function CountsScreen() {
  const [starting, setStarting] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: stockControlKeys.counts, queryFn: fetchCounts });
  return (
    <div>
      <PageHeader
        title="Stock counts"
        subtitle="Count what is on the shelf; differences become adjustments once another admin approves"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <button onClick={() => setStarting(true)} className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Start count
          </button>
        }
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No stock counts yet" />
      {!!data?.length && <CountTable counts={data} />}
      {starting && <StartCountDialog onClose={() => setStarting(false)} />}
    </div>
  );
}

export default function StockCountsPage() {
  return (
    <RequireAuth roles={STORE_ROLES}>
      <CountsScreen />
    </RequireAuth>
  );
}
