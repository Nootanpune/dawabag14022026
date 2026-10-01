'use client';
import { useRouter } from 'next/navigation';
import { createProduct } from '@/lib/admin/products';
import { blankForm, buildCreateBody } from '@/lib/admin/productForm';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import ProductForm from '@/components/admin/products/ProductForm';
import { useProductSave } from '@/components/admin/products/useProductSave';

export default function NewProductPage() {
  const router = useRouter();
  const save = useProductSave(createProduct, 'Product created — copy sent for pharmacist review', () => router.push('/admin/products'));
  return (
    <div>
      <BackLink href="/admin/products" label="Products" />
      <PageHeader title="Add product" subtitle="Enter prices in rupees; they are saved in paise on the server" />
      <ProductForm
        initial={blankForm()}
        pending={save.pending}
        error={save.error}
        fieldErrors={save.fieldErrors}
        submitLabel="Create product"
        onSubmit={(v) => save.submit(buildCreateBody(v))}
      />
    </div>
  );
}
