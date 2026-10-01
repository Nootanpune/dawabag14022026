import Link from 'next/link';
import type { StockCount } from '@/lib/stock/types';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateTimeIST } from '@/lib/dates';

export default function CountTable({ counts }: { counts: StockCount[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Count</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5 text-right">Batches</th>
            <th className="font-medium px-4 py-2.5">Started</th>
            <th className="font-medium px-4 py-2.5">Submitted / approved</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/staff/stock-counts/${c.id}`} className="font-medium text-brand-700 hover:underline">
                  {c.count_no}
                </Link>
                <p className="text-xs text-gray-400">{c.scope}</p>
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{c.lines}</td>
              <td className="px-4 py-2.5 text-xs text-gray-500">{formatDateTimeIST(c.created_at)}</td>
              <td className="px-4 py-2.5 text-xs text-gray-500">
                {c.submitted_at ? formatDateTimeIST(c.submitted_at) : '—'}
                {c.approved_at && <span className="block">{formatDateTimeIST(c.approved_at)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
