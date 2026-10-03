import { Clock } from 'lucide-react';
import { formatDateTimeIST } from '@/lib/dates';

/** Sprint 37 — a live feed with no snapshot inside its window: stock held back. Static (a warning). */
export default function StaleBadge({ lastAt, short = false }: { lastAt: string | null; short?: boolean }) {
  return (
    <span className="stale-badge" data-testid="stale-badge">
      <Clock className="w-3 h-3" aria-hidden="true" />
      {short ? 'Feed stale' : `Feed stale — last update ${lastAt ? formatDateTimeIST(lastAt, { zone: true }) : 'never'}`}
    </span>
  );
}
