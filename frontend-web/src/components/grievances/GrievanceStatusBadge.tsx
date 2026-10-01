import { cn } from '@/lib/utils';
import type { GrievanceStatus } from '@/lib/grievances/api';

const TONES: Record<GrievanceStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  acknowledged: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

const LABELS: Record<GrievanceStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function GrievanceStatusBadge({ status }: { status: GrievanceStatus }) {
  return (
    <span className={cn('inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', TONES[status] ?? 'bg-gray-100')}>
      {LABELS[status] ?? status}
    </span>
  );
}
