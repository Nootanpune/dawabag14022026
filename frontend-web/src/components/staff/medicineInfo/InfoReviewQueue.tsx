'use client';
import { useQuery } from '@tanstack/react-query';
import QueryState from '@/components/admin/QueryState';
import { fetchInfoQueue, medicineInfoKeys } from '@/lib/medicineInfo/api';
import InfoReviewCard from './InfoReviewCard';

/**
 * Medicine information waiting for a SECOND pharmacist (Sprint 36, four eyes) — the
 * same C-19 review as product copy. Versions the viewer wrote come last, marked.
 */
export default function InfoReviewQueue() {
  const { data, isLoading, error } = useQuery({ queryKey: medicineInfoKeys.queue, queryFn: fetchInfoQueue,
    select: (rows) => [...rows].sort((a, b) => Number(!!a.authored_by_you) - Number(!!b.authored_by_you)) });
  return (
    <section className="mt-6" aria-labelledby="info-queue-heading">
      <h2 id="info-queue-heading" className="text-lg font-semibold text-gray-900">Waiting for approval</h2>
      <p className="text-sm text-gray-500 mb-3">
        Shown to buyers only after another pharmacist approves it; until then the previous approved text (if any) stays.
      </p>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No medicine information waiting for review" />
      <div className="space-y-3">{data?.map((v) => <InfoReviewCard key={v.id} v={v} />)}</div>
    </section>
  );
}
