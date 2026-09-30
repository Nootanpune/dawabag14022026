import type { KycHistoryEntry } from '@/lib/admin/kyc';
import { formatDateTimeIST } from '@/lib/admin/format';

export default function KycHistory({ history }: { history: KycHistoryEntry[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-3">History</h3>
      {history.length === 0 ? (
        <p className="text-sm text-gray-400">No history yet.</p>
      ) : (
        <ol className="space-y-3 text-sm">
          {history.map((h, i) => (
            <li key={`${h.created_at}-${i}`} className="border-l-2 border-gray-200 pl-3">
              <p className="font-medium text-gray-800">{h.action.replace(/_/g, ' ')}</p>
              {h.notes && <p className="text-gray-600 text-xs mt-0.5">{h.notes}</p>}
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDateTimeIST(h.created_at)}
                {h.performed_by_name ? ` · ${h.performed_by_name}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
