import Link from 'next/link';
import type { ReceiptRow } from '@/lib/purchasing/types';
import { formatDateIST, formatDateTimeIST, formatPaise } from '@/lib/admin/format';

export default function ReceiptTable({ receipts }: { receipts: ReceiptRow[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">GRN</th>
            <th className="font-medium px-4 py-2.5">Supplier</th>
            <th className="font-medium px-4 py-2.5">Supplier invoice</th>
            <th className="font-medium px-4 py-2.5">PO</th>
            <th className="font-medium px-4 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/staff/receive/${r.id}`} className="font-medium text-brand-700 hover:underline">
                  {r.grn_number}
                </Link>
                <p className="text-xs text-gray-400">{formatDateTimeIST(r.created_at)}</p>
              </td>
              <td className="px-4 py-2.5">{r.supplier_name}</td>
              <td className="px-4 py-2.5 text-xs">
                <p>{r.supplier_invoice_no}</p>
                <p className="text-gray-400">{formatDateIST(r.supplier_invoice_date)}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">{r.po_number ?? 'No PO'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(r.total_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
