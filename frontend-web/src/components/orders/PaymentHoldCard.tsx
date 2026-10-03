import { ShieldCheck } from 'lucide-react';
import type { OrderDetail } from '@/lib/orders/api';

/**
 * Sprint 39 (owner decision 2026-10-03; C-37): a prescription order's payment is only held
 * (authorised) until our pharmacist checks the prescription; then it is taken, or — if the
 * order cannot be supplied — released, so the buyer is never charged. The server's words.
 */
export default function PaymentHoldCard({ order }: { order: OrderDetail }) {
  const p = order.payment;
  if (!p || p.capture !== 'after_pharmacist_check' || !p.note || !['authorized', 'released'].includes(p.status)) return null;
  return (
    <div className="card flex gap-2 text-sm" data-testid="payment-hold-card">
      <ShieldCheck className="w-5 h-5 shrink-0 text-brand-700" aria-hidden="true" />
      <div>
        <p className="font-semibold">{p.status === 'authorized' ? 'Payment authorised, not yet charged' : 'Payment released — not charged'}</p>
        <p className="text-gray-700">{p.note}</p>
      </div>
    </div>
  );
}
