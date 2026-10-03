import type { OrderDetail } from '@/lib/orders/api';
import { formatPrice } from '@/lib/utils';
import { formatDateTimeIST } from '@/lib/dates';

const REFUND_WORDS: Record<string, string> = {
  recorded: 'refunded the way you paid',
  after_capture: 'refunded as soon as the held payment is taken',
  not_needed: 'not charged',
  credit_bill: 'taken off your credit bill',
  none: '',
};
const EXTRA_WORDS: Record<string, string> = {
  awaiting_payment: 'to pay',
  authorised: 'held until the pharmacist’s check',
  paid: 'paid',
  on_credit_bill: 'added to your credit bill',
  superseded: 'replaced by a later change',
  cancelled: 'not charged (order cancelled)',
};

/** Changes the buyer made: before the invoice (Sprint 44) or, earlier, after it with a credit note (Sprint 43). */
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
              {e.lines.map((l, i) => (
                <li key={`${l.order_item_id ?? 'new'}-${i}`}>
                  {l.product_name}: {l.kind === 'added' ? `added (${l.to_qty})` : l.to_qty === 0 ? 'removed' : `${l.from_qty} → ${l.to_qty}`}
                </li>
              ))}
            </ul>
            {e.refund_paise > 0 && (
              <p className="text-xs text-gray-600 mt-1">{formatPrice(e.refund_paise)} {REFUND_WORDS[e.refund_status]}</p>
            )}
            {(e.extra_paise ?? 0) > 0 && (
              <p className="text-xs text-gray-600 mt-1">{formatPrice(e.extra_paise ?? 0)} more — {EXTRA_WORDS[e.extra_status ?? ''] ?? e.extra_status}</p>
            )}
            {e.sent_to_pharmacist && <p className="text-xs text-gray-600 mt-1">Sent back to our pharmacist for the prescription check.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
