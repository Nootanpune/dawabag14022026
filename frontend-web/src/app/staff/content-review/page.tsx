'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchContentQueue, productKeys } from '@/lib/products/api';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ContentReviewCard from '@/components/staff/content/ContentReviewCard';
import Link from 'next/link';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

// Pharmacist review of product copy before it is shown (C-19)
function ContentReviewQueue() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: productKeys.contentQueue,
    queryFn: fetchContentQueue,
  });
  return (
    <div>
      <PageHeader
        title="Product copy review"
        subtitle="Descriptions are hidden from buyers until a pharmacist approves them"
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No product copy waiting for review" />
      <div className="space-y-3">{data?.map((p) => <ContentReviewCard key={p.id} p={p} />)}</div>
      {/* Sprint 36: medicine information has its own page (a second pharmacist approves it) */}
      <p className="text-sm text-gray-600 mt-6">
        Medicine information (uses, side effects, warnings) is approved on{' '}
        <Link href="/staff/medicine-info-approvals" className="text-brand-700 underline">Medicine information to approve</Link>.
      </p>
    </div>
  );
}

export default function ContentReviewPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <ContentReviewQueue />
    </RequireAuth>
  );
}
