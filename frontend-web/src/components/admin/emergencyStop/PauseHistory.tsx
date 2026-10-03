import type { PauseHistoryRow } from '@/lib/emergencyStop/api';
import { formatDateTimeIST } from '@/lib/dates';

/** Every pause and resume, from the audit log (C-46). */
export default function PauseHistory({ rows }: { rows: PauseHistoryRow[] }) {
  return (
    <section aria-labelledby="pause-history">
      <h2 id="pause-history" className="text-sm font-semibold text-gray-800 mb-2">History</h2>
      <ul className="card p-0 divide-y divide-gray-100 text-sm">
        {rows.map((r, i) => (
          <li key={`${r.created_at}-${i}`} className="px-3 py-2">
            <span className="font-medium">{r.action === 'rx_sales_paused' ? 'Paused' : 'Resumed'}</span>
            {' '}· {formatDateTimeIST(r.created_at)} · {r.by_name ?? 'unknown'}
            {r.action === 'rx_sales_paused' && r.new_value && (
              <span className="block text-xs text-gray-600">Ref. {r.new_value.reference} — {r.new_value.reason}</span>
            )}
            {r.action === 'rx_sales_resumed' && r.notes && <span className="block text-xs text-gray-600">{r.notes}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
