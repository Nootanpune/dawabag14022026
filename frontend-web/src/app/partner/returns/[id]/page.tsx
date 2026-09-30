'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchPartnerReturn, returnKeys } from '@/lib/returns/api';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ReturnDetailView from '@/components/returns/ReturnDetailView';

export default function PartnerReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: returnKeys.partnerOne(id), queryFn: () => fetchPartnerReturn(id) });
  return (
    <div>
      <BackLink href="/partner/returns" label="Returns" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && (
        <>
          <ReturnDetailView r={data} />
          <p className="text-xs text-gray-500 mt-3">
            Deductions for approved returns appear under “Return adjustments” on your next settlement.
          </p>
        </>
      )}
    </div>
  );
}
