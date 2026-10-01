import Link from 'next/link';
import type { PurchaseReturnRow } from '@/lib/purchaseReturns/types';
import { RETURN_REASON_LABELS } from '@/lib/purchaseReturns/labels';
import { formatPaise } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateTimeIST } from '@/lib/dates';

/** Purchase returns, newest first; who raised and who approved each (C-46). */
export default function PurchaseReturnTable({ rows }: { rows: PurchaseReturnRow[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Return</th>
            <th className="font-medium px-4 py-2.5">Supplier</th>
            <th className="font-medium px-4 py-2.5">Reason</th>
            <th className="font-medium px-4 py-2.5 text-right">Total</th>
            <th className="font-medium px-4 py-2.5">Requested / approved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
              <td className="px-4 py-2.5">
                <Link href={`/staff/purchase-returns/${r.id}`} className="font-medium text-brand-700 hover:underline">
                  {r.return_no}
                </Link>
                <div className="mt-0.5">
                  <StatusBadge status={r.status} />
                </div>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p className="text-sm">{r.supplier_name}</p>
                <p className="font-mono text-gray-400">{r.supplier_gstin ?? '—'}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">{RETURN_REASON_LABELS[r.reason] ?? r.reason}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(r.total_paise)}</td>
              <td className="px-4 py-2.5 text-xs">
                <p>
                  {r.requested_by_name} · {formatDateTimeIST(r.created_at)}
                </p>
                {r.decided_at && (
                  <p className="text-gray-500">
                    {r.approved_by_name ?? '—'} · {formatDateTimeIST(r.decided_at)}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
