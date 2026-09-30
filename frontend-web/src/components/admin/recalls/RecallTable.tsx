import Link from 'next/link';
import type { Recall } from '@/lib/recalls/api';
import { formatDateTimeIST } from '@/lib/admin/format';

export default function RecallTable({ rows }: { rows: Recall[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Batch</th>
            <th className="font-medium px-4 py-2.5">Reason</th>
            <th className="font-medium px-4 py-2.5">Recalled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-2.5">
                <Link href={`/admin/recalls/${r.id}`} className="text-brand-700 hover:underline font-medium">
                  {r.product_name}
                </Link>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{r.batch_number}</td>
              <td className="px-4 py-2.5 text-xs text-gray-600">
                <span className="line-clamp-2">{r.reason}</span>
                {r.source && <span className="text-gray-400">Source: {r.source}</span>}
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                {formatDateTimeIST(r.recalled_at)}
                {r.recalled_by_name && <span className="block">by {r.recalled_by_name}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
