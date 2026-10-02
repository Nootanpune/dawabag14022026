import { AlertTriangle } from 'lucide-react';
import type { CheckSignal } from '@/lib/fulfilment/types';

/** Things to look at before releasing (never a block on their own): quantity at the limit,
 *  habit forming, Schedule H1 / X / NDPS, the same medicine bought again recently. */
export default function CheckSignals({ signals }: { signals: CheckSignal[] }) {
  if (!signals.length) return <p className="text-xs text-gray-600" data-testid="check-signals">No quantity or repeat-purchase signals.</p>;
  return (
    <ul className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 space-y-0.5" data-testid="check-signals" aria-label="Signals to check">
      {signals.map((s, i) => (
        <li key={i} className="flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span><span className="font-semibold">{s.product_name}:</span> {s.signal}</span>
        </li>
      ))}
    </ul>
  );
}
