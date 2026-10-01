'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchPurchaseReturns, purchaseReturnKeys } from '@/lib/purchaseReturns/api';
import { RETURN_TABS } from '@/lib/purchaseReturns/labels';
import type { PurchaseReturnStatus } from '@/lib/purchaseReturns/types';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import PurchaseReturnTable from '@/components/staff/purchaseReturns/PurchaseReturnTable';

// Returns to suppliers (C-28): raised by store staff, approved by a second person (C-46).
function PurchaseReturnsScreen() {
  const [status, setStatus] = useState<PurchaseReturnStatus | ''>('requested');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: purchaseReturnKeys.list(status),
    queryFn: () => fetchPurchaseReturns(status),
  });
  return (
    <div>
      <PageHeader
        title="Purchase returns"
        subtitle="Recalled, expired or damaged stock back to the supplier. Stock leaves the batches when a second person approves."
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <Link href="/staff/purchase-returns/new" className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> New return
          </Link>
        }
      />
      <StatusTabs tabs={RETURN_TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No purchase returns" />
      {!!data?.length && <PurchaseReturnTable rows={data} />}
    </div>
  );
}

export default function PurchaseReturnsPage() {
  return (
    <RequireAuth roles={STORE_ROLES}>
      <PurchaseReturnsScreen />
    </RequireAuth>
  );
}
