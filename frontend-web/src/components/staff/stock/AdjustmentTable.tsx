import type { ReactNode } from 'react';
import type { Adjustment } from '@/lib/stock/types';
import { REASON_LABELS, DISPOSAL_LABELS } from '@/lib/stock/labels';
import { formatPaise } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';

interface Props {
  rows: Adjustment[];
  /** buttons for a row (approve / reject / record destruction) */
  actions?: (a: Adjustment) => ReactNode;
}

/** Adjustments and destruction-register entries; who asked and who approved (C-46). */
export default function AdjustmentTable({ rows, actions }: Props) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Adjustment</th>
            <th className="font-medium px-4 py-2.5">Product / batch</th>
            <th className="font-medium px-4 py-2.5 text-right">Units</th>
            <th className="font-medium px-4 py-2.5 text-right">Value at cost</th>
            <th className="font-medium px-4 py-2.5">Requested / decided</th>
            {actions && <th className="px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-gray-50 align-top">
              <td className="px-4 py-2.5">
                <p className="font-medium">{a.adjustment_no}</p>
                <p className="text-xs text-gray-500">{REASON_LABELS[a.reason] ?? a.reason}</p>
                <StatusBadge status={a.status} />
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p className="text-sm font-medium">{a.product_name}</p>
                <p className="text-gray-400">
                  {a.batch_number} · exp {formatDateIST(a.expiry_date)}
                </p>
                <p className="text-gray-600 mt-1">{a.notes}</p>
              </td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${a.quantity_delta < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {a.quantity_delta > 0 ? `+${a.quantity_delta}` : a.quantity_delta}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(a.value_paise)}</td>
              <td className="px-4 py-2.5 text-xs">
                <p>
                  {a.requested_by_name} · {formatDateTimeIST(a.created_at)}
                </p>
                {a.decided_at && (
                  <p className="text-gray-500">
                    {a.approved_by_name ?? '—'} · {formatDateTimeIST(a.decided_at)}
                    {a.decision_notes && ` — ${a.decision_notes}`}
                  </p>
                )}
                {a.disposed_at && (
                  <p className="text-gray-500 mt-1">
                    Destroyed {formatDateTimeIST(a.disposed_at)} · {a.disposal_method ? DISPOSAL_LABELS[a.disposal_method] : ''} · ref{' '}
                    {a.disposal_reference} · witness {a.disposal_witness}
                  </p>
                )}
              </td>
              {actions && <td className="px-4 py-2.5 text-right whitespace-nowrap">{actions(a)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
