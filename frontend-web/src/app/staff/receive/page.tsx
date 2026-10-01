'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import { fetchPurchaseOrders, fetchReceipts, purchasingKeys } from '@/lib/purchasing/api';
import { RECEIVE_WITHOUT_PO_ROLES, STORE_ROLES } from '@/lib/purchasing/roles';
import { hasRole } from '@/lib/admin/roles';
import { useAuthStore } from '@/store/authStore';
import type { ReceiptFilter } from '@/lib/purchasing/types';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import PoTable from '@/components/admin/purchasing/PoTable';
import Pager from '@/components/admin/Pager';
import ReceiptTable from '@/components/staff/receive/ReceiptTable';
import ReceiptFilters from '@/components/staff/receive/ReceiptFilters';
import { daysAgoIST, todayIST } from '@/lib/dates';

const RECEIPT_PAGE_SIZE = 50;

function ReceiveScreen() {
  const canReceiveWithoutPo = hasRole(useAuthStore((s) => s.user?.role), RECEIVE_WITHOUT_PO_ROLES);
  const [filter, setFilter] = useState<ReceiptFilter>(() => ({
    from: daysAgoIST(30),
    to: todayIST(),
    vendor_id: '',
    q: '',
    page: 1,
    limit: RECEIPT_PAGE_SIZE,
  }));
  // any filter change goes back to page 1
  const onFilter = useCallback((patch: Partial<ReceiptFilter>) => setFilter((f) => ({ ...f, ...patch, page: 1 })), []);
  const badRange = !!filter.from && !!filter.to && filter.from > filter.to;
  const sent = useQuery({ queryKey: purchasingKeys.orders('sent'), queryFn: () => fetchPurchaseOrders('sent') });
  const part = useQuery({
    queryKey: purchasingKeys.orders('partially_received'),
    queryFn: () => fetchPurchaseOrders('partially_received'),
  });
  const receipts = useQuery({ queryKey: purchasingKeys.receipts(filter), queryFn: () => fetchReceipts(filter), enabled: !badRange });
  const rows = receipts.data?.receipts ?? [];
  const open = [...(part.data ?? []), ...(sent.data ?? [])];

  return (
    <div>
      <PageHeader
        title="Receive goods"
        subtitle="Stock enters only against a licensed supplier's tax invoice"
        onRefresh={() => {
          sent.refetch();
          part.refetch();
          receipts.refetch();
        }}
        refreshing={sent.isFetching || part.isFetching || receipts.isFetching}
        actions={
          canReceiveWithoutPo ? (
            <Link href="/staff/receive/new" className="btn-outline text-sm inline-flex items-center gap-1">
              <PackagePlus className="w-4 h-4" /> Receive without a PO
            </Link>
          ) : undefined
        }
      />
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Purchase orders awaiting goods</h2>
      <QueryState isLoading={sent.isLoading || part.isLoading} error={sent.error || part.error} isEmpty={!open.length} emptyText="No open purchase orders" />
      {!!open.length && <PoTable orders={open} hrefFor={(po) => `/staff/receive/new?po=${po.id}`} />}

      <h2 className="text-sm font-semibold text-gray-700 mt-8 mb-2">Goods receipts</h2>
      <ReceiptFilters value={filter} onChange={onFilter} />
      {badRange ? (
        <p className="text-sm text-red-600">&quot;From&quot; must be on or before &quot;to&quot;</p>
      ) : (
        <>
          <QueryState isLoading={receipts.isLoading} error={receipts.error} isEmpty={!rows.length} emptyText="No receipts match" />
          {!!rows.length && <ReceiptTable receipts={rows} />}
          {receipts.data && (
            <Pager page={filter.page} limit={filter.limit} total={receipts.data.total} onPage={(page) => setFilter((f) => ({ ...f, page }))} />
          )}
        </>
      )}
    </div>
  );
}

export default function ReceivePage() {
  return (
    <RequireAuth roles={STORE_ROLES}>
      <ReceiveScreen />
    </RequireAuth>
  );
}
