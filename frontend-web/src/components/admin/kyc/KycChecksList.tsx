import type { KycCheck } from '@/lib/admin/kyc';
import StatusBadge from '../StatusBadge';
import { checkLabel } from './useKycActions';
import { formatDateTimeIST } from '@/lib/dates';

export default function KycChecksList({ checks }: { checks: KycCheck[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-3">Checks</h3>
      {checks.length === 0 ? (
        <p className="text-sm text-gray-400">No checks recorded.</p>
      ) : (
        <ul className="divide-y divide-gray-50 text-sm">
          {checks.map((c) => (
            <li key={c.check} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="font-medium text-gray-800">{checkLabel(c.check, c.label)}</p>
                {(c.method || c.verified_at) && (
                  <p className="text-xs text-gray-400">
                    {c.method ? c.method.replace(/_/g, ' ') : ''}
                    {c.method && c.verified_at ? ' · ' : ''}
                    {c.verified_at ? formatDateTimeIST(c.verified_at) : ''}
                  </p>
                )}
              </div>
              <StatusBadge status={c.result} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
