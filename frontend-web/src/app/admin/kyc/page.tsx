'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchKycQueue, kycKeys, type KycQueueType } from '@/lib/admin/kyc';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import KycQueueTable from '@/components/admin/kyc/KycQueueTable';

const FILTERS: { value: KycQueueType; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'b2b_retailer', label: 'Retailers' },
  { value: 'b2b_wholesaler', label: 'Wholesalers' },
  { value: 'doc_hospital', label: 'Doctors' },
];

export default function KycQueuePage() {
  const [type, setType] = useState<KycQueueType>('');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: kycKeys.queue(type),
    queryFn: () => fetchKycQueue(type),
  });

  return (
    <div>
      <PageHeader
        title="KYC review"
        subtitle="Applications awaiting review, renewal or GSTIN re-check — oldest first"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <select value={type} onChange={(e) => setType(e.target.value as KycQueueType)} className="input w-auto">
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        }
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No applications in the queue" />
      {!!data?.length && <KycQueueTable rows={data} />}
    </div>
  );
}
