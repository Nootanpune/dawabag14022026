'use client';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import PurchaseReturnForm from '@/components/staff/purchaseReturns/PurchaseReturnForm';

export default function NewPurchaseReturnPage() {
  return (
    <RequireAuth roles={STORE_ROLES}>
      <BackLink href="/staff/purchase-returns" label="Purchase returns" />
      <PageHeader title="New purchase return" subtitle="Nothing leaves stock until a second person approves the return" />
      <PurchaseReturnForm />
    </RequireAuth>
  );
}
