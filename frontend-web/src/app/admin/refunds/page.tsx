'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminRefunds, returnKeys, type Refund } from '@/lib/returns/api';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import RefundsTable from '@/components/admin/refunds/RefundsTable';
import MarkRefundProcessedDialog from '@/components/admin/refunds/MarkRefundProcessedDialog';

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'processed', label: 'Processed' },
] as const;

// Refunds from cancellations and returns (C-37)
export default function AdminRefundsPage() {
  const [status, setStatus] = useState<(typeof TABS)[number]['value']>('pending');
  const [marking, setMarking] = useState<Refund | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: returnKeys.adminRefunds(status),
    queryFn: () => fetchAdminRefunds(status),
  });
  return (
    <div>
      <PageHeader
        title="Refunds"
        subtitle="Gateway refunds go to Razorpay automatically. If Razorpay refused one, retry when the cause is fixed, or refund by bank transfer and record the UTR"
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No refunds here" />
      {!!data?.length && <RefundsTable rows={data} onMarkProcessed={setMarking} />}
      {marking && <MarkRefundProcessedDialog refund={marking} onClose={() => setMarking(null)} />}
    </div>
  );
}
