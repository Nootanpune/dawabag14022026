import { AlertTriangle } from 'lucide-react';
import type { GrievanceSummary } from '@/lib/grievances/api';
import { formatDateTimeIST } from '@/lib/dates';

/**
 * Acknowledge-by (48 h) and resolve-by (30 days) dates with overdue flags.
 * The server computes both deadlines and the flags (C-36).
 */
export default function GrievanceDueDates({ g, compact }: { g: GrievanceSummary; compact?: boolean }) {
  const cls = compact ? 'text-xs' : 'text-sm';
  return (
    <div className={`${cls} text-gray-500 space-y-0.5`}>
      <p className={g.ack_overdue ? 'text-red-600 font-medium' : ''}>
        {g.acknowledged_at ? `Acknowledged ${formatDateTimeIST(g.acknowledged_at)}` : `Acknowledge by ${formatDateTimeIST(g.ack_due_at, { zone: true })}`}
        {g.ack_overdue && <OverdueFlag />}
      </p>
      <p className={g.resolution_overdue ? 'text-red-600 font-medium' : ''}>
        {g.resolved_at ? `Resolved ${formatDateTimeIST(g.resolved_at)}` : `Resolve by ${formatDateTimeIST(g.resolve_due_at, { zone: true })}`}
        {g.resolution_overdue && <OverdueFlag />}
      </p>
    </div>
  );
}

export function OverdueFlag() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
      <AlertTriangle className="w-3 h-3" /> Overdue
    </span>
  );
}
