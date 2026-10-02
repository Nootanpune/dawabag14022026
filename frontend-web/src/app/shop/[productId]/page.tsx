'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchProduct, productKeys } from '@/lib/products/api';
import Header from '@/components/layout/Header';
import Breadcrumbs from '@/components/layout/Breadcrumbs';
import { searchHref } from '@/lib/search/searchUrl';
import QueryState from '@/components/admin/QueryState';
import ProductSummary from '@/components/shop/ProductSummary';
import ProductDeclarations from '@/components/shop/ProductDeclarations';
import DeliveryInfo from '@/components/shop/DeliveryInfo';
import ProductTrustStrip from '@/components/shop/ProductTrustStrip';
import SubstitutesPreview from '@/components/shop/substitutes/SubstitutesPreview';
import MedicineInfo from '@/components/shop/medicineInfo/MedicineInfo';

// Product page: buyer's own price, declarations (C-17), approved copy only (C-19);
// Sprint 33: delivery date / expiry / cold chain, trust links, substitutes, and the
// pharmacist-reviewed medicine information (hidden until approved; empty sections hidden).
export default function ProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: productKeys.one(productId), queryFn: () => fetchProduct(productId) });
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Breadcrumbs items={[
          { label: 'Home', href: '/' },
          ...(data?.category ? [{ label: data.category, href: searchHref({ category: data.category }) }] : [{ label: 'Medicines', href: '/search' }]),
          { label: data?.name ?? 'Medicine' },
        ]} />
        <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
        {data && (
          <>
            <ProductSummary p={data} />
            <DeliveryInfo p={data} />
            <ProductTrustStrip />
            <SubstitutesPreview productId={data.id} />
            <MedicineInfo productId={data.id} />
            <ProductDeclarations p={data} />
          </>
        )}
      </div>
    </div>
  );
}
