'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchReceipt, purchasingKeys } from '@/lib/purchasing/api';
import { STORE_ROLES } from '@/lib/purchasing/roles';
import { formatDateIST, formatDateTimeIST, formatPaise } from '@/lib/admin/format';
import RequireAuth from '@/components/auth/RequireAuth';
import BackLink from '@/components/admin/BackLink';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import ReceiptLinesTable from '@/components/staff/receive/ReceiptLinesTable';

// A goods receipt is a final record (C-34): shown read-only.
function ReceiptDetail({ id }: { id: string }) {
  const { data: g, isLoading, error } = useQuery({ queryKey: purchasingKeys.receipt(id), queryFn: () => fetchReceipt(id) });
  const tax = g ? [['CGST', g.cgst_paise], ['SGST', g.sgst_paise], ['IGST', g.igst_paise]].filter(([, v]) => Number(v) > 0) : [];
  return (
    <div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!g} emptyText="Receipt not found" />
      {g && (
        <>
          <PageHeader title={g.grn_number} subtitle={`${g.supplier_name} · ${g.po_number ?? 'No PO'} · ${formatDateTimeIST(g.created_at)}`} />
          <div className="card grid sm:grid-cols-4 gap-3 text-sm mb-4">
            <div>
              <p className="text-xs text-gray-400">Supplier invoice</p>
              <p>{g.supplier_invoice_no}</p>
              <p className="text-xs text-gray-400">{formatDateIST(g.supplier_invoice_date)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Supplier GSTIN / DL</p>
              <p className="font-mono text-xs">{g.supplier_gstin ?? '—'}</p>
              <p className="text-xs">{g.supplier_dl_no ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Taxable</p>
              <p>{formatPaise(g.taxable_paise)}</p>
              {tax.map(([k, v]) => (
                <p key={String(k)} className="text-xs text-gray-400">
                  {k} {formatPaise(v)}
                </p>
              ))}
            </div>
            <div>
              <p className="text-xs text-gray-400">Total</p>
              <p className="font-semibold">{formatPaise(g.total_paise)}</p>
            </div>
            {g.notes && <p className="sm:col-span-4 text-gray-600">Notes: {g.notes}</p>}
          </div>
          <ReceiptLinesTable lines={g.lines} />
        </>
      )}
    </div>
  );
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth roles={STORE_ROLES}>
      <BackLink href="/staff/receive" label="Receive goods" />
      <ReceiptDetail id={id} />
    </RequireAuth>
  );
}
