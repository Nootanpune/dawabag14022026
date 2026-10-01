'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchListings, partnerKeys } from '@/lib/partner/api';
import type { PartnerListing } from '@/lib/partner/types';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ListingsTable from '@/components/partner/listings/ListingsTable';
import StockEditorDialog from '@/components/partner/listings/StockEditorDialog';

export default function PartnerListingsPage() {
  const [editing, setEditing] = useState<PartnerListing | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: partnerKeys.listings,
    queryFn: fetchListings,
  });

  return (
    <div>
      <PageHeader
        title="My listings"
        subtitle={data ? `${data.length} products` : undefined}
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <Link href="/partner/catalogue" className="btn-primary text-sm">
            List a product
          </Link>
        }
      />
      <QueryState
        isLoading={isLoading}
        error={error}
        isEmpty={!data?.length}
        emptyText="You have not listed any products yet"
      />
      {!!data?.length && <ListingsTable listings={data} onEditStock={setEditing} />}
      {editing && <StockEditorDialog listing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
