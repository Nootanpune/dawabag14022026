import type { DataRequest } from '@/lib/privacy/api';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateTimeIST } from '@/lib/dates';

interface Props {
  rows: DataRequest[];
  onAction: (r: DataRequest, action: 'complete' | 'reject') => void;
}

/** Correction / erasure requests from users (C-43, C-44). */
export default function DataRequestTable({ rows, onAction }: Props) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">User</th>
            <th className="font-medium px-4 py-2.5">Request</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-2.5">
                {r.user_name ?? '—'}
                <span className="block text-xs text-gray-400">{r.mobile ?? ''}</span>
              </td>
              <td className="px-4 py-2.5">
                <span className="capitalize font-medium">{r.request_type}</span>
                <span className="text-xs text-gray-400"> · {formatDateTimeIST(r.created_at)}</span>
                {r.details && <p className="text-xs text-gray-600 whitespace-pre-wrap mt-0.5">{r.details}</p>}
                {r.outcome && <p className="text-xs text-gray-500 mt-1">Outcome: {r.outcome}</p>}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.status === 'completed' ? 'processed' : r.status} label={r.status} />
                {r.handled_at && <span className="block text-xs text-gray-400 mt-0.5">{formatDateTimeIST(r.handled_at)}</span>}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-right">
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => onAction(r, 'complete')} className="btn-primary text-xs py-1 px-2.5 mr-2">
                      Complete
                    </button>
                    <button onClick={() => onAction(r, 'reject')} className="text-xs text-red-600 hover:underline">
                      Reject
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
