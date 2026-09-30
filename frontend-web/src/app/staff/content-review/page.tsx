'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchContentQueue, productKeys } from '@/lib/products/api';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ContentReviewCard from '@/components/staff/content/ContentReviewCard';
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
