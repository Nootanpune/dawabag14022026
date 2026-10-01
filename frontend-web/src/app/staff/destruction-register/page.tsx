'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDestructionRegister, stockControlKeys } from '@/lib/stock/api';
import type { Adjustment } from '@/lib/stock/types';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import AdjustmentTable from '@/components/staff/stock/AdjustmentTable';
import DisposalDialog from '@/components/staff/stock/DisposalDialog';
import DestructionCsvButton from '@/components/staff/stock/DestructionCsvButton';
import { useAuthStore } from '@/store/authStore';

const TABS = [
  { value: 'pending', label: 'Awaiting destruction' },
  { value: 'done', label: 'Destroyed' },
] as const;

// Approved write-offs of expired, damaged and recalled stock, and their destruction record (C-28, C-34).
function DestructionRegister() {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('pending');
  const [recording, setRecording] = useState<Adjustment | null>(null);
  const userId = useAuthStore((s) => s.user?.id);
  const pending = tab === 'pending';
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: stockControlKeys.destruction(pending),
    queryFn: () => fetchDestructionRegister(pending),
  });

  return (
    <div>
      <PageHeader
        title="Destruction register"
        subtitle="Expired, damaged and recalled stock written off and awaiting or recorded as destroyed"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={<DestructionCsvButton pending={pending} />}
      />
      <StatusTabs tabs={TABS} value={tab} onChange={setTab} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText={pending ? 'Nothing awaiting destruction' : 'No destructions recorded'} />
      {!!data?.length && (
        <AdjustmentTable
          rows={data}
          actions={
            pending
              ? (a) =>
                  // The person who raised the write-off cannot record its destruction (C-46; server 403)
                  userId && a.requested_by === userId ? (
                    <span className="text-xs text-gray-400">Raised by you — someone else records it</span>
                  ) : (
                    <button onClick={() => setRecording(a)} className="btn-primary text-xs py-1.5 px-3">
                      Record destruction
                    </button>
                  )
              : undefined
          }
        />
      )}
      {recording && <DisposalDialog adjustment={recording} onClose={() => setRecording(null)} />}
    </div>
  );
}

export default function DestructionRegisterPage() {
  return (
    <RequireAuth roles={STORE_ROLES}>
      <DestructionRegister />
    </RequireAuth>
  );
}
