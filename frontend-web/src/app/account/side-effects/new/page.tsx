'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import BackLink from '@/components/admin/BackLink';
import AdrForm from '@/components/adverse/AdrForm';

/** ?product=&order=&name= pre-fill from an order line (C-29). */
function FormFromLink() {
  const sp = useSearchParams();
  return (
    <AdrForm
      productId={sp?.get('product') ?? undefined}
      productName={sp?.get('name') ?? undefined}
      orderId={sp?.get('order') ?? undefined}
    />
  );
}

export default function NewSideEffectPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <BackLink href="/account/side-effects" label="Side-effect reports" />
        <h1 className="text-lg font-semibold mb-3">Report a side effect</h1>
        <Suspense fallback={null}>
          <FormFromLink />
        </Suspense>
      </div>
    </div>
  );
}
