'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchSettlement, settlementKeys } from '@/lib/admin/settlements';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import BackLink from '@/components/admin/BackLink';
import SettlementDetailView from '@/components/settlements/SettlementDetailView';
import RecordPayoutDialog from '@/components/admin/settlements/RecordPayoutDialog';

export default function AdminSettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [paying, setPaying] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: settlementKeys.detail(id),
    queryFn: () => fetchSettlement(id),
  });

  return (
    <div>
      <BackLink href="/admin/settlements" label="Settlements" />
      <PageHeader
        title={data?.batch_ref ?? 'Settlement'}
        subtitle={data?.partner_name}
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          data && data.payment_status !== 'paid' ? (
            <button onClick={() => setPaying(true)} className="btn-primary text-sm">
              Record payout
            </button>
          ) : undefined
        }
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && <SettlementDetailView settlement={data} />}
      {paying && data && <RecordPayoutDialog settlement={data} onClose={() => setPaying(false)} />}
    </div>
  );
}
