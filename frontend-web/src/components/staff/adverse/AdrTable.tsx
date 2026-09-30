import { labelOf, SERIOUSNESS, type AdrSummary } from '@/lib/compliance/adverseEvents';
import { formatDateTimeIST } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';

/** Reports with the server's PvPI forwarding deadline and overdue flag (C-29). */
export default function AdrTable({ rows, onOpen }: { rows: AdrSummary[]; onOpen: (id: string) => void }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">Report</th>
            <th className="font-medium px-4 py-2.5">Medicine</th>
            <th className="font-medium px-4 py-2.5">Seriousness</th>
            <th className="font-medium px-4 py-2.5">Forward by</th>
            <th className="font-medium px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className={r.overdue ? 'bg-red-50/40' : ''}>
              <td className="px-4 py-2.5">
                <button onClick={() => onOpen(r.id)} className="font-mono text-xs text-brand-700 hover:underline">
                  {r.report_no}
                </button>
                <p className="text-xs text-gray-400">{formatDateTimeIST(r.created_at)}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">
                {r.product_name}
                {r.batch_number && <span className="text-gray-400"> · {r.batch_number}</span>}
              </td>
              <td className={`px-4 py-2.5 text-xs ${r.seriousness !== 'non_serious' ? 'text-red-700 font-medium' : ''}`}>
                {labelOf(SERIOUSNESS, r.seriousness)}
              </td>
              <td className="px-4 py-2.5 text-xs">
                {formatDateTimeIST(r.forward_due_at)}
                {r.overdue && <span className="ml-1"><StatusBadge status="overdue" /></span>}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.status} />
                {r.pvpi_reference && <p className="text-xs text-gray-400 font-mono">{r.pvpi_reference}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
