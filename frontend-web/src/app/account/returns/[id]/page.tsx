'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchReturn, returnKeys } from '@/lib/returns/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ReturnDetailView from '@/components/returns/ReturnDetailView';

export default function MyReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: returnKeys.one(id), queryFn: () => fetchReturn(id) });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account/returns" label="Returns and refunds" />
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && (
          <>
            <ReturnDetailView r={data} />
            <p className="text-xs text-gray-500 mt-4">
              Credit note PDFs are on the{' '}
              <Link href={`/orders/${data.order_id}`} className="text-brand-600 hover:underline">
                order page
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
