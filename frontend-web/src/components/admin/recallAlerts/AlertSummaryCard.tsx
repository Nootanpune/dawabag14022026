import type { AlertDetail } from '@/lib/recallAlerts/types';
import { SOURCE_LABELS } from '@/lib/recallAlerts/labels';
import DeadlineBadge from './DeadlineBadge';
import { formatDateTimeIST } from '@/lib/dates';

/** Alert header: source, receipt, 4-hour deadline (C-28) and decision counts. */
export default function AlertSummaryCard({ alert: a }: { alert: AlertDetail }) {
  const stats = [
    ['Lines', a.lines.length],
    ['Matches', a.matches],
    ['To decide', a.pending],
    ['Recalled', a.recalled],
    ['Cleared', a.cleared],
  ] as const;
  return (
    <div className="card mb-4 text-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-gray-500">Source</dt>
          <dd>{SOURCE_LABELS[a.source] ?? a.source}</dd>
          <dt className="text-gray-500">Received</dt>
          <dd>{formatDateTimeIST(a.received_at)}</dd>
          <dt className="text-gray-500">Deadline</dt>
          <dd>{formatDateTimeIST(a.due_at, { zone: true })}</dd>
          <dt className="text-gray-500">Entered</dt>
          <dd>
            {formatDateTimeIST(a.entered_at)}
            {a.entered_by_name ? ` by ${a.entered_by_name}` : ''}
          </dd>
        </dl>
        <DeadlineBadge dueAt={a.due_at} pending={a.pending} matches={a.matches} />
      </div>
      <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-3">
        {stats.map(([label, n]) => (
          <div key={label}>
            <span className="block text-xs text-gray-500">{label}</span>
            <span className={`text-lg font-semibold tabular-nums ${label === 'To decide' && n ? 'text-amber-700' : ''}`}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
