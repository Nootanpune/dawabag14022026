'use client';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FlaskConical } from 'lucide-react';
import SoldBySection, { type OrderShipment } from '@/components/orders/SoldBySection';
import { formatPrice } from '@/lib/utils';
import RxAttachedLine, { type ChosenRx } from './rx/RxAttachedLine';
import { CHARGE_AFTER_CHECK } from './rx/RxPolicyNote';

interface Props {
  orderNumber: string;
  totalPaise: number;
  shipments?: OrderShipment[];
  /** paid with the trial's demo payment (no money moved) */
  demo?: boolean;
  /** how the demo payment was made, e.g. "Card ending 1111 (demo)" */
  paidBy?: string;
  rx?: ChosenRx | null;
  /** Sprint 39: the payment is only authorised (held) until the pharmacist's check passes */
  authorised?: boolean;
}

export default function OrderConfirmed({ orderNumber, totalPaise, shipments, demo, paidBy, rx, authorised }: Props) {
  const router = useRouter();
  return (
    <div className="card text-center py-10">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-700" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">{authorised ? 'Order placed — payment authorised' : rx ? 'Order placed and paid' : 'Order confirmed!'}</h2>
      <p className="text-gray-500 text-sm mb-1">
        Order ID: <strong>{orderNumber}</strong>
      </p>
      {/* Seller amounts below are each invoice's items and GST; the total paid also has delivery */}
      <p className="text-gray-700 text-sm mb-1">
        {authorised ? 'Amount held' : 'Total paid'}: <strong>{formatPrice(totalPaise)}</strong> <span className="text-gray-500">incl. delivery and GST</span>
      </p>
      {authorised && (
        <p className="text-sm font-semibold text-brand-800 mb-1" data-testid="charge-after-check">
          {CHARGE_AFTER_CHECK} If the order cannot be supplied, the hold is released and you are not charged.
        </p>
      )}
      {paidBy && <p className="text-gray-700 text-sm mb-1">Paid by: <strong>{paidBy}</strong></p>}
      {demo && (
        <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 rounded-full px-3 py-1 my-2">
          <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" /> Demo payment — no money moved
        </p>
      )}
      {rx && (
        <div className="text-left max-w-md mx-auto my-3 space-y-2">
          <RxAttachedLine rx={rx} />
          <p className="text-sm text-gray-700">Next: our pharmacist checks your prescription. Once it is accepted we take the payment, pack and dispatch your order, and tell you at each step.</p>
        </div>
      )}
      <p className="text-gray-400 text-xs mb-6">You&apos;ll receive SMS and email updates at every step.</p>
      <SoldBySection shipments={shipments} className="text-left max-w-sm mx-auto mb-6 border border-gray-100 rounded-lg p-3" />
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={() => router.push('/orders')} className="btn-outline">
          Track my order
        </button>
        <button onClick={() => router.push('/')} className="btn-primary">
          Continue shopping
        </button>
      </div>
    </div>
  );
}
