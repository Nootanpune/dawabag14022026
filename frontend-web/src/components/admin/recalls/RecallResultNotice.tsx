import Link from 'next/link';
import type { RecallResult } from '@/lib/recalls/api';

/** Summary the server returns after a recall is recorded (C-28). */
export default function RecallResultNotice({ r, onDismiss }: { r: RecallResult; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-3 mb-4 text-sm">
      <p className="font-medium text-green-900">
        Batch {r.batch_number} of {r.product_name} recalled
      </p>
      <p className="text-green-800 text-xs mt-1">
        Blocked {r.own_batches} Dawabag and {r.partner_batches} partner stock batch(es) · {r.orders_notified} buyer order(s) notified ·{' '}
        {r.awaiting_dispatch} line(s) not yet dispatched (blocked from packing and dispatch)
      </p>
      <div className="flex gap-3 mt-2 text-xs">
        <Link href={`/admin/recalls/${r.id}`} className="text-brand-700 hover:underline">
          View affected orders
        </Link>
        <button onClick={onDismiss} className="text-gray-500 hover:underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}
