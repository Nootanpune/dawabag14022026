'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { partnerKeys, searchCatalogue } from '@/lib/partner/api';
import type { CatalogueProduct } from '@/lib/partner/types';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import CatalogueResults from '@/components/partner/catalogue/CatalogueResults';
import ListProductDialog from '@/components/partner/catalogue/ListProductDialog';

export default function PartnerCataloguePage() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [listing, setListing] = useState<CatalogueProduct | null>(null);

  // Debounce typing; the server needs at least 2 characters.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const enabled = q.length >= 2;
  const { data, isLoading, error } = useQuery({
    queryKey: partnerKeys.catalogue(q),
    queryFn: () => searchCatalogue(q),
    enabled,
  });

  return (
    <div>
      <PageHeader
        title="Catalogue"
        subtitle="Find a Dawabag catalogue product and list it. Prices are set by Dawabag."
      />
      <div className="relative mb-4 max-w-md">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by name, generic or SKU"
          className="input pl-9"
          autoFocus
        />
      </div>
      {enabled ? (
        <>
          <QueryState
            isLoading={isLoading}
            error={error}
            isEmpty={!data?.length}
            emptyText="No catalogue products match"
          />
          {!!data?.length && <CatalogueResults products={data} onList={setListing} />}
        </>
      ) : (
        <p className="text-sm text-gray-400">Type at least 2 characters to search.</p>
      )}
      {listing && <ListProductDialog product={listing} onClose={() => setListing(null)} />}
    </div>
  );
}
