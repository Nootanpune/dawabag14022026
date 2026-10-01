'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchPurchaseOrders, purchasingKeys } from '@/lib/purchasing/api';
import type { PoStatus } from '@/lib/purchasing/types';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusTabs from '@/components/admin/StatusTabs';
import PoTable from '@/components/admin/purchasing/PoTable';

const TABS: readonly { value: PoStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_received', label: 'Part received' },
  { value: 'received', label: 'Received' },
  { value: 'closed', label: 'Closed short' },
  { value: 'cancelled', label: 'Cancelled' },
];

function PurchaseOrdersScreen() {
  const [status, setStatus] = useState<PoStatus | ''>('');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: purchasingKeys.orders(status),
    queryFn: () => fetchPurchaseOrders(status),
  });

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        subtitle="Drafts are approved before they go to the supplier"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <Link href="/admin/purchase-orders/new" className="btn-primary text-sm inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> New PO
          </Link>
        }
      />
      <StatusTabs tabs={TABS} value={status} onChange={setStatus} />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No purchase orders" />
      {!!data?.length && <PoTable orders={data} hrefFor={(po) => `/admin/purchase-orders/${po.id}`} />}
    </div>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <RequireAuth roles={PURCHASE_ADMIN_ROLES}>
      <PurchaseOrdersScreen />
    </RequireAuth>
  );
}
