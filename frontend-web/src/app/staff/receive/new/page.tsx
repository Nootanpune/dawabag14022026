'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchPurchaseOrder, purchasingKeys } from '@/lib/purchasing/api';
import { RECEIVE_WITHOUT_PO_ROLES, STORE_ROLES } from '@/lib/purchasing/roles';
import { hasRole } from '@/lib/admin/roles';
import { useAuthStore } from '@/store/authStore';
import RequireAuth from '@/components/auth/RequireAuth';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ReceiptForm from '@/components/staff/receive/ReceiptForm';

/** ?po=<id> receives against that purchase order; without it, a receipt with no PO. */
function NewReceipt() {
  const poId = useSearchParams()?.get('po') ?? '';
  const role = useAuthStore((s) => s.user?.role);
  const po = useQuery({ queryKey: purchasingKeys.order(poId), queryFn: () => fetchPurchaseOrder(poId), enabled: !!poId });
  if (!poId) {
    return (
      <>
        <PageHeader title="Receive goods" subtitle="Without a purchase order" />
        {/* Admins only (C-46); the server refuses others with 403 */}
        {hasRole(role, RECEIVE_WITHOUT_PO_ROLES) ? (
          <ReceiptForm />
        ) : (
          <p className="card text-sm text-gray-600">
            Receive against an approved purchase order, or ask an admin to receive goods that were not ordered.
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <PageHeader title={po.data ? `Receive against ${po.data.po_number}` : 'Receive goods'} subtitle={po.data?.supplier_name} />
      <QueryState isLoading={po.isLoading} error={po.error} isEmpty={false} emptyText="" />
      {po.data && <ReceiptForm key={po.data.id} po={po.data} />}
    </>
  );
}

export default function NewReceiptPage() {
  return (
    <RequireAuth roles={STORE_ROLES}>
      <BackLink href="/staff/receive" label="Receive goods" />
      <Suspense fallback={null}>
        <NewReceipt />
      </Suspense>
    </RequireAuth>
  );
}
