'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { creditKeys, fetchOpenCredit, type OpenCreditOrder } from '@/lib/admin/credit';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import OpenCreditTable from '@/components/admin/credit/OpenCreditTable';
import RecordPaymentDialog from '@/components/admin/credit/RecordPaymentDialog';

export default function CreditPage() {
  const [settling, setSettling] = useState<OpenCreditOrder | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: creditKeys.open,
    queryFn: fetchOpenCredit,
  });
  const overdue = data?.filter((o) => (o.days_to_due ?? 0) < 0).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Credit"
        subtitle={data ? `${data.length} open credit orders${overdue ? ` · ${overdue} overdue` : ''}` : undefined}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <p className="text-xs text-gray-500 mb-4">
        Set a buyer&apos;s credit limit from their KYC application page (approved retailers and wholesalers).
      </p>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No open credit orders" />
      {!!data?.length && <OpenCreditTable orders={data} onRecordPayment={setSettling} />}
      {settling && <RecordPaymentDialog order={settling} onClose={() => setSettling(null)} />}
    </div>
  );
}
