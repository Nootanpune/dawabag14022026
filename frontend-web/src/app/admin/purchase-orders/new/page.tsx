'use client';
import RequireAuth from '@/components/auth/RequireAuth';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import PoForm from '@/components/admin/purchasing/PoForm';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';

export default function NewPurchaseOrderPage() {
  return (
    <RequireAuth roles={PURCHASE_ADMIN_ROLES}>
      <BackLink href="/admin/purchase-orders" label="Purchase orders" />
      <PageHeader title="New purchase order" subtitle="Saved as a draft; approve it to send it to the supplier" />
      <PoForm />
    </RequireAuth>
  );
}
