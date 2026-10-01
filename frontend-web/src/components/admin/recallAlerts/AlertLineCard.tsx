import type { AlertLine, AlertMatch } from '@/lib/recallAlerts/types';
import MatchRow from './MatchRow';

interface Props {
  line: AlertLine;
  onRecall: (m: AlertMatch) => void;
  onClear: (m: AlertMatch) => void;
  onClearProduct: () => void;
}

/**
 * One line of the regulator alert and our products carrying its batch (C-28).
 * Unmatched lines are "Not held"; their batch is still refused at receipt until an
 * admin clears the product.
 */
export default function AlertLineCard({ line, onRecall, onClear, onClearProduct }: Props) {
  const held = line.matches.length > 0;
  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 bg-gray-50 text-sm">
        <div>
          <span className="text-xs text-gray-400 mr-2">#{line.line_no}</span>
          <span className="font-medium">{line.drug_name}</span>
          <span className="font-mono text-xs ml-2">batch {line.batch_number}</span>
          {line.manufacturer && <span className="block text-xs text-gray-500">{line.manufacturer}</span>}
          {line.reason && <span className="block text-xs text-gray-600 mt-0.5">{line.reason}</span>}
        </div>
        <div className="flex items-center gap-2">
          {!held && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">Not held</span>}
          <button onClick={onClearProduct} className="text-xs text-brand-700 hover:underline">
            Clear a product refused at receipt
          </button>
        </div>
      </div>
      {held && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr className="text-left">
                <th className="font-medium px-3 py-2">Our product</th>
                <th className="font-medium px-3 py-2">Our batch</th>
                <th className="font-medium px-3 py-2 text-right">Held</th>
                <th className="font-medium px-3 py-2 text-right">Sold</th>
                <th className="font-medium px-3 py-2">Decision</th>
                <th className="font-medium px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {line.matches.map((m) => (
                <MatchRow key={m.id} match={m} onRecall={() => onRecall(m)} onClear={() => onClear(m)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
