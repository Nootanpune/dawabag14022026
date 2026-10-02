import { formatDateIST } from '@/lib/dates';
import type { LicenceBadgeData } from '@/lib/licences/forms';
import { Pill } from './LicenceList';

/**
 * For admin lists: how many checked licences, the earliest valid-till, and a warning when
 * that is within 30 days or past (the party is blocked from that day until renewed).
 */
export default function LicenceExpiryBadge({ b }: { b: LicenceBadgeData }) {
  return (
    <div className="text-xs space-y-0.5" data-testid="licence-badge">
      <p>
        {b.licence_count} licence{b.licence_count === 1 ? '' : 's'}
        {b.pending_count > 0 && <span className="text-amber-700"> · {b.pending_count} waiting</span>}
      </p>
      {b.earliest_expiry && <p className="text-gray-500">earliest valid till {formatDateIST(b.earliest_expiry)}</p>}
      {b.expiry_warning === 'expired' && <Pill text="licence expired" tone="bg-red-100 text-red-800" />}
      {b.expiry_warning === 'expiring' && <Pill text="renewal due ≤ 30 days" tone="bg-orange-100 text-orange-800" />}
    </div>
  );
}
