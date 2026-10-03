import type { OrderDetail } from '@/lib/orders/api';
import { formatPrice } from '@/lib/utils';
import { formatDateTimeIST } from '@/lib/dates';

const REFUND_WORDS: Record<string, string> = {
  recorded: 'refunded the way you paid',
  after_capture: 'refunded as soon as the held payment is taken',
  not_needed: 'not charged',
  none: '',
};

/** Changes the buyer made before packing (Sprint 43): what changed and the money back. */
export default function OrderEditsCard({ order }: { order: OrderDetail }) {
  const edits = order.edits ?? [];
  if (!edits.length) return null;
  return (
    <div className="card mb-4 text-sm">
      <h3 className="font-semibold mb-2">Changes you made</h3>
      <ul className="divide-y divide-gray-100">
        {edits.map((e) => (
          <li key={e.id} className="py-2">
            <p className="text-xs text-gray-500">{formatDateTimeIST(e.edited_at)}</p>
            <ul className="mt-1">
              {e.lines.map((l) => (
                <li key={l.order_item_id}>
                  {l.product_name}: {l.to_qty === 0 ? 'removed' : `${l.from_qty} → ${l.to_qty}`}
                </li>
              ))}
            </ul>
            {e.refund_paise > 0 && (
              <p className="text-xs text-gray-600 mt-1">{formatPrice(e.refund_paise)} {REFUND_WORDS[e.refund_status]}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
