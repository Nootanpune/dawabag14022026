'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchProduct, productKeys } from '@/lib/products/api';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import QueryState from '@/components/admin/QueryState';
import ProductSummary from '@/components/shop/ProductSummary';
import ProductDeclarations from '@/components/shop/ProductDeclarations';

// Product page: buyer's own price, declarations (C-17), approved copy only (C-19)
export default function ProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: productKeys.one(productId), queryFn: () => fetchProduct(productId) });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <BackLink href="/" label="All medicines" />
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && (
          <>
            <ProductSummary p={data} />
            <ProductDeclarations p={data} />
          </>
        )}
      </div>
    </div>
  );
}
