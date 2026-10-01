'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchSuppliers, purchasingKeys } from '@/lib/purchasing/api';
import type { Supplier } from '@/lib/purchasing/types';
import type { PendingVendor } from '@/lib/admin/vendors';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import SupplierTable from '@/components/admin/purchasing/SupplierTable';
import AddSupplierDialog from '@/components/admin/purchasing/AddSupplierDialog';
import ApproveVendorDialog from '@/components/admin/vendors/ApproveVendorDialog';

/** The vendor approval dialog only needs id / name / type; the rest is display. */
function asPendingVendor(s: Supplier): PendingVendor {
  return {
    id: s.id,
    name: s.name,
    drug_license_no: s.drug_license_no,
    gst_number: s.gst_number,
    contact_name: null,
    contact_mobile: null,
    contact_email: null,
    vendor_type: 'supplier',
    pincode: null,
    city: null,
    state: s.state,
    created_at: '',
    dl_portal_url: null,
  };
}

// Licensed suppliers only (C-02): buying is blocked until the licence is approved and while it is in date.
function SuppliersScreen() {
  const [adding, setAdding] = useState(false);
  const [approving, setApproving] = useState<Supplier | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: purchasingKeys.suppliers, queryFn: fetchSuppliers });

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle={
          <>
            Wholesalers Dawabag buys from. Approval uses the same licence check as{' '}
            <Link href="/admin/vendors" className="text-brand-600 hover:underline">
              Vendors
            </Link>
            .
          </>
        }
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <button onClick={() => setAdding(true)} className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add supplier
          </button>
        }
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No suppliers yet" />
      {!!data?.length && <SupplierTable suppliers={data} onApprove={setApproving} />}
      {adding && <AddSupplierDialog onClose={() => setAdding(false)} />}
      {approving && <ApproveVendorDialog vendor={asPendingVendor(approving)} onClose={() => setApproving(null)} />}
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <RequireAuth roles={PURCHASE_ADMIN_ROLES}>
      <SuppliersScreen />
    </RequireAuth>
  );
}
