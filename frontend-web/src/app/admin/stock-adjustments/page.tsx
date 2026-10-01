'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdjustments, stockControlKeys } from '@/lib/stock/api';
import type { Adjustment, AdjustmentStatus } from '@/lib/stock/types';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import AdjustmentTable from '@/components/staff/stock/AdjustmentTable';
import DecideDialog from '@/components/staff/stock/DecideDialog';

const TABS: readonly { value: AdjustmentStatus | ''; label: string }[] = [
  { value: 'requested', label: 'Awaiting approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

// Every stock change outside sales and receipts is approved by someone other than the requester (C-46).
function AdjustmentQueue() {
  const [status, setStatus] = useState<AdjustmentStatus | ''>('requested');
  const [deciding, setDeciding] = useState<{ a: Adjustment; approve: boolean } | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: stockControlKeys.adjustments(status),
    queryFn: () => fetchAdjustments(status),
  });

  return (
    <div>
      <PageHeader
        title="Stock adjustments"
        subtitle="Two-person rule: you cannot approve an adjustment you raised"
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No adjustments" />
      {!!data?.length && (
        <AdjustmentTable
          rows={data}
          actions={(a) =>
            a.status === 'requested' && (
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeciding({ a, approve: true })} className="btn-primary text-xs py-1.5 px-3">
                  Approve
                </button>
                <button
                  onClick={() => setDeciding({ a, approve: false })}
                  className="border border-red-500 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
                >
                  Reject
                </button>
              </div>
            )
          }
        />
      )}
      {deciding && <DecideDialog adjustment={deciding.a} approve={deciding.approve} onClose={() => setDeciding(null)} />}
    </div>
  );
}

export default function StockAdjustmentsPage() {
  return (
    <RequireAuth roles={PURCHASE_ADMIN_ROLES}>
      <AdjustmentQueue />
    </RequireAuth>
  );
}
