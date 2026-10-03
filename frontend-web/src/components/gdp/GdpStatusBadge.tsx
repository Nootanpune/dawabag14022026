import { cn } from '@/lib/utils';
import { GDP_STATUS_LABELS, type GdpStatus } from '@/lib/gdp/api';

const TONES: Record<GdpStatus, string> = {
  ok: 'bg-green-100 text-green-800',
  on_hold: 'bg-red-100 text-red-800',
  quarantined: 'bg-orange-100 text-orange-900',
  destroyed: 'bg-gray-200 text-gray-800',
};

/** A batch's GDP standing (Sprint 40, C-25). */
export default function GdpStatusBadge({ status }: { status: GdpStatus }) {
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[status] ?? TONES.ok)} data-testid="gdp-status">
      {GDP_STATUS_LABELS[status] ?? status}
    </span>
  );
}
