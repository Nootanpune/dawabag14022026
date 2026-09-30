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
  'OUT OF STOCK': 'bg-red-100 text-red-800',
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
