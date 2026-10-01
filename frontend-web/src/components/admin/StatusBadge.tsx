import { cn } from '@/lib/utils';

const TONES: Record<string, string> = {
  verified: 'bg-green-100 text-green-800',
  approved: 'bg-green-100 text-green-800',
  succeeded: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  pending_kyc: 'bg-amber-100 text-amber-800',
  pending_otp: 'bg-gray-100 text-gray-700',
  pending_renewal: 'bg-orange-100 text-orange-800',
  running: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-red-100 text-red-800',
  flagged_gstin: 'bg-red-100 text-red-800',
  live: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  active: 'bg-green-100 text-green-800',
  dispatched: 'bg-blue-100 text-blue-800',
  processed: 'bg-blue-100 text-blue-800',
  on_hold: 'bg-orange-100 text-orange-800',
  more_info_needed: 'bg-orange-100 text-orange-800',
  paused: 'bg-gray-100 text-gray-700',
  disputed: 'bg-red-100 text-red-800',
  delisted: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
  requested: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
  returned: 'bg-gray-100 text-gray-600',
  new: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-blue-100 text-blue-800',
  forwarded: 'bg-green-100 text-green-800',
  valid: 'bg-green-100 text-green-800',
  expiring: 'bg-orange-100 text-orange-800',
  expired: 'bg-red-100 text-red-800',
  no_expiry: 'bg-gray-100 text-gray-700',
  overdue: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-800',
  skipped: 'bg-amber-100 text-amber-800',
  partially_received: 'bg-amber-100 text-amber-800',
  received: 'bg-green-100 text-green-800',
  open: 'bg-blue-100 text-blue-800',
  submitted: 'bg-amber-100 text-amber-800',
  near_expiry: 'bg-orange-100 text-orange-800',
  recalled: 'bg-red-100 text-red-800',
  generated: 'bg-green-100 text-green-800',
  settled: 'bg-green-100 text-green-800',
  refund_pending: 'bg-amber-100 text-amber-800',
  refunded: 'bg-gray-100 text-gray-600',
  'OUT OF STOCK':'bg-red-100 text-red-800',
  'REORDER NOW': 'bg-orange-100 text-orange-800',
  'LOW STOCK': 'bg-amber-100 text-amber-800',
};

/** Pill for any server status string; unknown values render neutral. */
export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap',
        TONES[status] ?? 'bg-gray-100 text-gray-700'
      )}
    >
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}
