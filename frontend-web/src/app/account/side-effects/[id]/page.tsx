'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adrKeys, fetchAdr } from '@/lib/compliance/adverseEvents';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import AdrDetailView from '@/components/adverse/AdrDetailView';

export default function SideEffectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: adrKeys.one(id), queryFn: () => fetchAdr(id) });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account/side-effects" label="Side-effect reports" />
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && <AdrDetailView r={data} />}
      </div>
    </div>
  );
}
