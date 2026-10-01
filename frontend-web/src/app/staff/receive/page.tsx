'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import { fetchPurchaseOrders, fetchReceipts, purchasingKeys } from '@/lib/purchasing/api';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import { daysAgoIST, todayIST } from '@/lib/fulfilment/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import PoTable from '@/components/admin/purchasing/PoTable';
import ReceiptTable from '@/components/staff/receive/ReceiptTable';

function ReceiveScreen() {
  const [from, setFrom] = useState(() => daysAgoIST(30));
  const [to, setTo] = useState(todayIST);
  const sent = useQuery({ queryKey: purchasingKeys.orders('sent'), queryFn: () => fetchPurchaseOrders('sent') });
  const part = useQuery({
    queryKey: purchasingKeys.orders('partially_received'),
    queryFn: () => fetchPurchaseOrders('partially_received'),
  });
  const receipts = useQuery({ queryKey: purchasingKeys.receipts(from, to), queryFn: () => fetchReceipts(from, to), enabled: from <= to });
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
          <Link href="/staff/receive/new" className="btn-outline text-sm inline-flex items-center gap-1">
            <PackagePlus className="w-4 h-4" /> Receive without a PO
          </Link>
        }
      />
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Purchase orders awaiting goods</h2>
      <QueryState isLoading={sent.isLoading || part.isLoading} error={sent.error || part.error} isEmpty={!open.length} emptyText="No open purchase orders" />
      {!!open.length && <PoTable orders={open} hrefFor={(po) => `/staff/receive/new?po=${po.id}`} />}

      <div className="flex flex-wrap items-end justify-between gap-3 mt-8 mb-2">
        <h2 className="text-sm font-semibold text-gray-700">Goods receipts</h2>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input w-auto" aria-label="From" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input w-auto" aria-label="To" />
        </div>
      </div>
      <QueryState isLoading={receipts.isLoading} error={receipts.error} isEmpty={!receipts.data?.length} emptyText="No receipts in this period" />
      {!!receipts.data?.length && <ReceiptTable receipts={receipts.data} />}
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
