import Link from 'next/link';
import type { AlertMatch } from '@/lib/recallAlerts/types';
import { DECISION_LABELS } from '@/lib/recallAlerts/labels';
import { formatDateTimeIST } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';

interface Props {
  match: AlertMatch;
  onRecall: () => void;
  onClear: () => void;
}

/** One of our products carrying the alert's batch, with its decision (C-28). */
export default function MatchRow({ match: m, onRecall, onClear }: Props) {
  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <span className="font-medium">{m.product_name}</span>
        {m.manufacturer && <span className="block text-xs text-gray-500">{m.manufacturer}</span>}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{m.batch_numbers?.length ? m.batch_numbers.join(', ') : '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums">{m.units_held ?? '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums">{m.units_sold ?? '—'}</td>
      <td className="px-3 py-2">
        <StatusBadge status={m.decision} label={DECISION_LABELS[m.decision]} />
      </td>
      <td className="px-3 py-2 text-xs">
        {m.decision === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={onRecall} className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-700">
              Recall
            </button>
            <button onClick={onClear} className="btn-outline text-xs py-1.5 px-3">
              Not this product
            </button>
          </div>
        ) : (
          <div className="text-gray-500">
            {formatDateTimeIST(m.decided_at)}
            {m.decided_by_name && <span> by {m.decided_by_name}</span>}
            {m.notes && <p className="text-gray-700 whitespace-pre-wrap mt-0.5">{m.notes}</p>}
            {m.recall_id && (
              <Link href={`/admin/recalls/${m.recall_id}`} className="block text-brand-700 hover:underline mt-0.5">
                View recall
              </Link>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
