import Link from 'next/link';
import type { AlertSummary } from '@/lib/recallAlerts/types';
import { SOURCE_LABELS } from '@/lib/recallAlerts/labels';
import { formatDateTimeIST } from '@/lib/admin/format';
import DeadlineBadge from './DeadlineBadge';

/** Regulator alerts with their 4-hour deadline and decision counts (C-28). */
export default function AlertTable({ rows }: { rows: AlertSummary[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">Alert</th>
            <th className="font-medium px-4 py-2.5">Source / reference</th>
            <th className="font-medium px-4 py-2.5">Received</th>
            <th className="font-medium px-4 py-2.5">Deadline</th>
            <th className="font-medium px-4 py-2.5 text-right">Lines</th>
            <th className="font-medium px-4 py-2.5 text-right">Matches</th>
            <th className="font-medium px-4 py-2.5 text-right">To decide</th>
            <th className="font-medium px-4 py-2.5 text-right">Recalled</th>
            <th className="font-medium px-4 py-2.5 text-right">Cleared</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((a) => (
            <tr key={a.id} className="align-top">
              <td className="px-4 py-2.5 whitespace-nowrap">
                <Link href={`/admin/recall-alerts/${a.id}`} className="text-brand-700 hover:underline font-medium font-mono">
                  {a.alert_no}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                <span className="block text-xs text-gray-500">{SOURCE_LABELS[a.source] ?? a.source}</span>
                <span className="line-clamp-2">{a.reference}</span>
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                {formatDateTimeIST(a.received_at)}
                {a.entered_by_name && <span className="block">entered by {a.entered_by_name}</span>}
              </td>
              <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                <span className="block text-gray-500 mb-1">{formatDateTimeIST(a.due_at)}</span>
                <DeadlineBadge dueAt={a.due_at} pending={a.pending} matches={a.matches} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{a.lines}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{a.matches}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums ${a.pending ? 'font-semibold text-amber-700' : ''}`}>{a.pending}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{a.recalled}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{a.cleared}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
