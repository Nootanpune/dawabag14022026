'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Images, Plus, Upload } from 'lucide-react';
import { adminProductKeys, fetchAdminProducts } from '@/lib/admin/products';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ProductTable from '@/components/admin/products/ProductTable';

export default function AdminProductsPage() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: adminProductKeys.list(q, page),
    queryFn: () => fetchAdminProducts(q, page),
    placeholderData: keepPreviousData,
  });
  const pages = data?.pagination.pages ?? 0;

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Active catalogue (Schedule X / NDPS and inactive products are not listed by the search)"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <>
            <Link href="/admin/catalogue-import" className="btn-outline text-sm inline-flex items-center gap-1">
              <Upload className="w-4 h-4" /> Import
            </Link>
            <Link href="/admin/products/photos" className="btn-outline text-sm inline-flex items-center gap-1">
              <Images className="w-4 h-4" /> Photos
            </Link>
            <Link href="/admin/products/new" className="btn-primary text-sm inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add product
            </Link>
          </>
        }
      />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name, generic or SKU" className="input mb-4 max-w-md" />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.products.length} emptyText="No products found" />
      {!!data?.products.length && <ProductTable products={data.products} />}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-outline text-xs py-1 px-3 disabled:opacity-40">
            Previous
          </button>
          <span className="text-gray-500">
            Page {page} of {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-outline text-xs py-1 px-3 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
