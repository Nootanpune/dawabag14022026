'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchPartners, partnerKeys } from '@/lib/admin/partnerOnboarding';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import PartnerTable from '@/components/admin/partners/PartnerTable';

/** Admin → Partners: every partner pharmacy; add one directly (Sprint 28). */
export default function PartnersPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: partnerKeys.list, queryFn: fetchPartners });
  return (
    <div>
      <PageHeader
        title="Partners"
        subtitle="Partner pharmacies that sell through Dawabag"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <Link href="/admin/partners/new" className="btn-primary text-sm py-2 px-3 inline-flex items-center gap-1">
            <Plus className="w-4 h-4" aria-hidden="true" /> Add partner
          </Link>
        }
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No partners yet" />
      {!!data?.length && <PartnerTable partners={data} />}
    </div>
  );
}
