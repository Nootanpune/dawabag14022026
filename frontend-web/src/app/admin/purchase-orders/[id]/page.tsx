'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchPurchaseOrder, purchasingKeys } from '@/lib/purchasing/api';
import { formatPaise } from '@/lib/admin/format';
import { PURCHASE_ADMIN_ROLES } from '@/lib/purchasing/roles';
import RequireAuth from '@/components/auth/RequireAuth';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import StatusBadge from '@/components/admin/StatusBadge';
import PoActions from '@/components/admin/purchasing/PoActions';
import PoItemsTable from '@/components/admin/purchasing/PoItemsTable';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';

function PoDetail({ id }: { id: string }) {
  const { data: po, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: purchasingKeys.order(id),
    queryFn: () => fetchPurchaseOrder(id),
  });
  return (
    <div>
      <BackLink href="/admin/purchase-orders" label="Purchase orders" />
      <QueryState isLoading={isLoading} error={error} isEmpty={!po} emptyText="Purchase order not found" />
      {po && (
        <>
          <PageHeader
            title={po.po_number}
            subtitle={
              <>
                {po.supplier_name} · GSTIN {po.gst_number ?? '—'} · Drug licences {po.supplier_licence_line ?? po.drug_license_no ?? '—'}
              </>
            }
            onRefresh={() => refetch()}
            refreshing={isFetching}
            actions={<PoActions po={po} />}
          />
          <div className="card grid sm:grid-cols-4 gap-3 text-sm mb-4">
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <StatusBadge status={po.status} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total (incl. GST)</p>
              <p className="font-medium">{formatPaise(po.total_amount_paise)}</p>
              <p className="text-xs text-gray-400">GST {formatPaise(po.gst_paise)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Raised</p>
              <p>{formatDateTimeIST(po.raised_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Expected by</p>
              <p>{formatDateIST(po.expected_by)}</p>
            </div>
            {po.notes && <p className="sm:col-span-4 text-gray-600">Notes: {po.notes}</p>}
            {po.closed_reason && <p className="sm:col-span-4 text-gray-600">Reason closed / cancelled: {po.closed_reason}</p>}
          </div>
          <PoItemsTable items={po.items} />
          <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-2">Goods receipts</h2>
          {po.receipts.length ? (
            <ul className="card divide-y divide-gray-100 p-0 text-sm">
              {po.receipts.map((r) => (
                <li key={r.id} className="px-4 py-2.5 flex flex-wrap justify-between gap-2">
                  <Link href={`/staff/receive/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.grn_number}
                  </Link>
                  <span className="text-gray-500">Invoice {r.supplier_invoice_no}</span>
                  <span className="tabular-nums">{formatPaise(r.total_paise)}</span>
                  <span className="text-xs text-gray-400">{formatDateTimeIST(r.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Nothing received yet</p>
          )}
        </>
      )}
    </div>
  );
}

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth roles={PURCHASE_ADMIN_ROLES}>
      <PoDetail id={id} />
    </RequireAuth>
  );
}
