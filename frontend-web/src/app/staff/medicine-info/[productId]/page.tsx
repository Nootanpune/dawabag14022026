'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import MedicineInfoEditor from '@/components/staff/medicineInfo/MedicineInfoEditor';
import VersionHistory from '@/components/staff/medicineInfo/VersionHistory';
import { fetchInfoEditor, medicineInfoKeys } from '@/lib/medicineInfo/api';
import { PHARMACIST_ROLES } from '@/lib/admin/roles';

// Medicine information editor (Sprint 33): pharmacists and admins write; a pharmacist approves (C-19).
function EditorPage() {
  const { productId } = useParams<{ productId: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: medicineInfoKeys.editor(productId), queryFn: () => fetchInfoEditor(productId), gcTime: 0,
  });
  return (
    <div className="max-w-4xl">
      {/* Sprint 43 (QA): opened from the product, the approvals list or new products — a way back */}
      <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/staff/medicine-info-approvals'))}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 mb-3">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
      </button>
      <PageHeader
        title={data ? `Medicine information — ${data.product.name}` : 'Medicine information'}
        subtitle={data ? [data.product.sku, data.product.generic_name, data.product.drug_schedule].filter(Boolean).join(' · ') : undefined}
        actions={data?.product.is_active ? <Link href={`/shop/${productId}`} className="text-sm text-brand-700 underline">View product page</Link> : undefined}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={false} emptyText="" />
      {data && (
        <div className="space-y-4">
          {/* key: a fresh form whenever the server's open version changes */}
          <MedicineInfoEditor key={`${data.open?.id ?? 'new'}-${data.open?.status ?? ''}`} data={data} />
          <VersionHistory versions={data.history} />
        </div>
      )}
    </div>
  );
}

export default function MedicineInfoEditorPage() {
  return (
    <RequireAuth roles={PHARMACIST_ROLES}>
      <EditorPage />
    </RequireAuth>
  );
}
