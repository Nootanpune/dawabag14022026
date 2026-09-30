import Link from 'next/link';
import { categoryLabel, type GrievanceSummary } from '@/lib/grievances/api';
import { formatDateTimeIST } from '@/lib/admin/format';
import GrievanceStatusBadge from '@/components/grievances/GrievanceStatusBadge';
import GrievanceDueDates from '@/components/grievances/GrievanceDueDates';

/** Staff complaint list with overdue flags (C-36). */
export default function GrievanceTable({ rows }: { rows: GrievanceSummary[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">Ticket</th>
            <th className="font-medium px-4 py-2.5">Subject</th>
            <th className="font-medium px-4 py-2.5">Buyer</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5">Deadlines</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((g) => (
            <tr key={g.id} className={g.ack_overdue || g.resolution_overdue ? 'bg-red-50/40' : ''}>
              <td className="px-4 py-2.5 align-top">
                <Link href={`/admin/grievances/${g.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                  {g.ticket_no}
                </Link>
                <p className="text-xs text-gray-400">{formatDateTimeIST(g.created_at)}</p>
              </td>
              <td className="px-4 py-2.5 align-top">
                <Link href={`/admin/grievances/${g.id}`} className="hover:underline">
                  {g.subject}
                </Link>
                <p className="text-xs text-gray-400">
                  {categoryLabel(g.category)}
                  {g.order_number ? ` · ${g.order_number}` : ''}
                </p>
              </td>
              <td className="px-4 py-2.5 align-top text-xs">{g.buyer_name ?? '—'}</td>
              <td className="px-4 py-2.5 align-top">
                <GrievanceStatusBadge status={g.status} />
              </td>
              <td className="px-4 py-2.5 align-top">
                <GrievanceDueDates g={g} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
