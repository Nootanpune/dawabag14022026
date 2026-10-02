'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { adminProductKeys, fetchProductForEdit, updateProduct } from '@/lib/admin/products';
import { buildPatchBody, formFromDetail } from '@/lib/admin/productForm';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ProductForm from '@/components/admin/products/ProductForm';
import ProductPhotoPanel from '@/components/admin/products/ProductPhotoPanel';
import { useProductSave } from '@/components/admin/products/useProductSave';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // gcTime 0: always prefill from the server's current values
  const { data, isLoading, error } = useQuery({ queryKey: adminProductKeys.one(id), queryFn: () => fetchProductForEdit(id), gcTime: 0 });
  const save = useProductSave((body) => updateProduct(id, body), 'Product updated', () => router.push('/admin/products'));
  const initial = data ? formFromDetail(data) : null;

  return (
    <div>
      <BackLink href="/admin/products" label="Products" />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && initial && (
        <>
          <PageHeader
            title={`Edit ${data.name}`}
            subtitle="Only changed fields are sent. Trade prices, NPPA ceiling, order minimums and reorder level are not shown here — leave them blank to keep the saved values."
          />
          {!data.content_reviewed && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
              Product copy is waiting for pharmacist approval (C-19); the description is hidden until then — leave it blank to keep it.
            </p>
          )}
          {data.content_reviewed && !data.description && (
            <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2 mb-3" data-testid="no-description">
              No description yet — add one under Product copy below (optional). A pharmacist approves it before buyers see it (C-19).
            </p>
          )}
          <ProductPhotoPanel
            productId={id}
            name={data.name}
            imageUrl={data.image_url ?? null}
            hasPhoto={!!data.s3_image_key}
            contentStatus={data.content_status}
          />
          <ProductForm
            initial={initial}
            editing
            pending={save.pending}
            error={save.error}
            fieldErrors={save.fieldErrors}
            submitLabel="Save changes"
            onSubmit={(v) => save.submit(buildPatchBody(v, initial))}
          />
        </>
      )}
    </div>
  );
}
