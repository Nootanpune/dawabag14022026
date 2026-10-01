'use client';
import Link from 'next/link';
import type { PurchaseOrderRow } from '@/lib/purchasing/types';
import { formatPaise } from '@/lib/admin/format';
import StatusBadge from '../StatusBadge';
import { formatDateIST } from '@/lib/dates';

/** Purchase order list; `hrefFor` decides where a row opens (admin detail or staff receive). */
export default function PoTable({ orders, hrefFor }: { orders: PurchaseOrderRow[]; hrefFor: (po: PurchaseOrderRow) => string }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">PO</th>
            <th className="font-medium px-4 py-2.5">Supplier</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5 text-right">Received / ordered</th>
            <th className="font-medium px-4 py-2.5 text-right">Total (incl. GST)</th>
            <th className="font-medium px-4 py-2.5">Expected by</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((po) => (
            <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={hrefFor(po)} className="font-medium text-brand-700 hover:underline">
                  {po.po_number}
                </Link>
                <p className="text-xs text-gray-400">{formatDateIST(po.raised_at)}</p>
              </td>
              <td className="px-4 py-2.5">{po.supplier_name}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={po.status} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {po.received_qty} / {po.ordered_qty}
                <span className="block text-xs text-gray-400">{po.lines} line(s)</span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(po.total_amount_paise)}</td>
              <td className="px-4 py-2.5 text-xs text-gray-500">{formatDateIST(po.expected_by)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
