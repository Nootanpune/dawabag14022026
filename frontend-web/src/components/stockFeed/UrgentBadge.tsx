import { AlertTriangle } from 'lucide-react';

/**
 * Sprint 37 — the URGENT, slowly blinking count of live stock-feed items waiting for a
 * person (owner decision 2026-10-03). Style in globals.css (.urgent-badge): ≥ 4.5:1
 * contrast throughout, 0.5 blinks a second, static under "reduce motion".
 */
export default function UrgentBadge({ count, label = 'to check', testId = 'urgent-badge' }: { count: number; label?: string; testId?: string }) {
  if (count <= 0) return null;
  return (
    <span className="urgent-badge" data-testid={testId} role="status" aria-label={`Urgent: ${count} stock item${count === 1 ? '' : 's'} ${label}`}>
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
