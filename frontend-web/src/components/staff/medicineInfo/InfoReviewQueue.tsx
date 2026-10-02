'use client';
import { useQuery } from '@tanstack/react-query';
import QueryState from '@/components/admin/QueryState';
import { fetchInfoQueue, medicineInfoKeys } from '@/lib/medicineInfo/api';
import InfoReviewCard from './InfoReviewCard';

/** Medicine information waiting for the pharmacist — the same C-19 review as product copy. */
export default function InfoReviewQueue() {
  const { data, isLoading, error } = useQuery({ queryKey: medicineInfoKeys.queue, queryFn: fetchInfoQueue });
  return (
    <section className="mt-8" aria-labelledby="info-queue-heading">
      <h2 id="info-queue-heading" className="text-lg font-semibold text-gray-900">Medicine information</h2>
      <p className="text-sm text-gray-500 mb-3">Shown to buyers only after approval; until then the previous approved text (if any) stays.</p>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No medicine information waiting for review" />
      <div className="space-y-3">{data?.map((v) => <InfoReviewCard key={v.id} v={v} />)}</div>
    </section>
  );
}
