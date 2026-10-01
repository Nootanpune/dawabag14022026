import type { OrderDetail } from '@/lib/orders/api';
import { formatPrice } from '@/lib/utils';

export default function OrderBillCard({ order }: { order: OrderDetail }) {
  return (
    <div className="card mb-4">
      <h3 className="font-semibold text-sm mb-3">Bill summary</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal_paise)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Shipping</span>
          <span>{formatPrice(order.shipping_paise)}</span>
        </div>
        {order.discount_paise > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Discount</span>
            <span>–{formatPrice(order.discount_paise)}</span>
          </div>
        )}
        <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold">
          <span>Total</span>
          <span className="text-brand-600">{formatPrice(order.total_paise)}</span>
        </div>
        {order.payment_method && (
          <p className="text-xs text-gray-400">
            Paid via {order.payment_method} · {order.gateway_payment_id}
          </p>
        )}
      </div>
    </div>
  );
}
