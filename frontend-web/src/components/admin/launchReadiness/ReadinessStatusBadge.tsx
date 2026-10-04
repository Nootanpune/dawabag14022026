import { STATUS_TONE, type ReadinessStatus } from '@/lib/admin/launchReadiness';

/** Status pill of one checklist item; the label comes from the server (e.g. "Not applicable on trial"). */
export default function ReadinessStatusBadge({ status, label }: { status: ReadinessStatus; label: string }) {
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_TONE[status]}`} data-status={status}>
      {label}
    </span>
  );
}
