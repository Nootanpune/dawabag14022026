import type { OrderDetail } from '@/lib/orders/api';
import { formatPrice } from '@/lib/utils';

function Row({ label, paise, minus, strong }: { label: string; paise: number; minus?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${minus ? 'text-green-700' : strong ? 'font-semibold' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span className={strong ? 'text-brand-600' : undefined}>{minus ? '–' : ''}{formatPrice(paise)}</span>
    </div>
  );
}

/**
 * The order's bill as charged at placement (C-35). Sprint 43 (QA): GST and wallet shown so the lines
 * add up to the total; money returned since (changes, cancellation, returns) shown below it.
 */
export default function OrderBillCard({ order }: { order: OrderDetail }) {
  const refunded = (order.refunds ?? []).filter((r) => r.status !== 'failed').reduce((s, r) => s + r.amount_paise, 0);
  return (
    <div className="card mb-4">
      <h3 className="font-semibold text-sm mb-3">Bill summary</h3>
      <div className="space-y-2 text-sm">
        <Row label="Items" paise={order.subtotal_paise} />
        {(order.gst_paise ?? 0) > 0 && <Row label="GST" paise={order.gst_paise!} />}
        <Row label="Delivery" paise={order.shipping_paise} />
        {order.discount_paise > 0 && <Row label="Discount" paise={order.discount_paise} minus />}
        {(order.wallet_used_paise ?? 0) > 0 && <Row label="Paid from wallet" paise={order.wallet_used_paise!} minus />}
        <div className="border-t border-gray-100 pt-2">
          <Row label="Total" paise={order.total_paise} strong />
        </div>
        {refunded > 0 && <Row label="Refunded since" paise={refunded} minus />}
        {order.payment_method && <p className="text-xs text-gray-400">Paid by {order.payment_method}</p>}
      </div>
    </div>
  );
}
