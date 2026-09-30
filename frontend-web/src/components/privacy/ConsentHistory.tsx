import type { ConsentRecord } from '@/lib/privacy/api';
import { PURPOSE_LABELS } from '@/lib/privacy/api';
import { formatDateTimeIST } from '@/lib/admin/format';

/** Every consent given or withdrawn, newest first (append-only log on the server, C-40). */
export default function ConsentHistory({ history }: { history: ConsentRecord[] }) {
  return (
    <details className="card mb-4">
      <summary className="font-semibold text-sm cursor-pointer">Consent history ({history.length})</summary>
      <ul className="mt-3 divide-y divide-gray-100 text-sm">
        {history.map((c, i) => (
          <li key={`${c.purpose}-${c.recorded_at}-${i}`} className="py-1.5 flex justify-between gap-3">
            <span>
              {PURPOSE_LABELS[c.purpose] ?? c.purpose.replace(/_/g, ' ')}:{' '}
              <span className={c.granted ? 'text-green-700' : 'text-gray-500'}>{c.granted ? 'given' : 'withdrawn'}</span>
            </span>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {formatDateTimeIST(c.recorded_at)} · v{c.policy_version}
            </span>
          </li>
        ))}
        {!history.length && <li className="py-1.5 text-xs text-gray-400">No consent records.</li>}
      </ul>
    </details>
  );
}
