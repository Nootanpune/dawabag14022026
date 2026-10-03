import { Ban } from 'lucide-react';
import type { OrderDetail } from '@/lib/orders/api';
import { formatDateIST } from '@/lib/dates';

/**
 * Sprint 35/36 — the pharmacist did not supply this order (C-08): the buyer sees the
 * reason written for them (orders.cancellation_reason) and that the money comes back
 * the way they paid (C-37). Never the staff-only hold note. Same wording as the app.
 */
export default function RefusedOrderCard({ order }: { order: OrderDetail }) {
  if (order.status !== 'cancelled' || order.pharmacist_check !== 'rejected') return null;
  const reason = order.cancellation_reason?.replace(/^Not supplied after the pharmacist's check:\s*/i, '').trim();
  return (
    <section className="card mb-4 border border-red-200 bg-red-50" aria-labelledby="refused-heading" data-testid="refused-order">
      <h2 id="refused-heading" className="font-semibold text-red-800 flex items-center gap-2">
        <Ban className="w-4 h-4" aria-hidden="true" /> Not supplied after the pharmacist&rsquo;s check
      </h2>
      {reason && <p className="text-sm text-red-900 mt-1"><span className="font-medium">Reason:</span> {reason}</p>}
      <p className="text-xs text-red-800 mt-2">
        The order was cancelled{order.cancelled_at ? ` on ${formatDateIST(order.cancelled_at)}` : ''}. Anything you paid is refunded the way you paid.
      </p>
    </section>
  );
}
