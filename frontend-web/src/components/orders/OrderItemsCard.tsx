import Link from 'next/link';
import type { OrderDetail } from '@/lib/orders/api';
import { formatPrice } from '@/lib/utils';

/** Ordered lines, each with a "Report a side effect" link (C-29). */
export default function OrderItemsCard({ order }: { order: OrderDetail }) {
  return (
    <div className="card mb-4">
      <h3 className="font-semibold text-sm mb-3">Items ordered</h3>
      <div className="space-y-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">💊</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium line-clamp-1">{item.product_name}</p>
              <p className="text-xs text-gray-400">
                {item.sku} · Qty: {item.quantity}
                {order.status !== 'pending_payment' && (
                  <>
                    {' · '}
                    <Link
                      href={`/account/side-effects/new?product=${item.product_id}&order=${order.id}&name=${encodeURIComponent(item.product_name)}`}
                      className="text-brand-600 hover:underline"
                    >
                      Report a side effect
                    </Link>
                  </>
                )}
              </p>
            </div>
            <p className="text-sm font-semibold">{formatPrice(item.line_total_paise)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
