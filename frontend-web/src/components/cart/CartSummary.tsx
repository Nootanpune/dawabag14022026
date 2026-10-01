import { ArrowRight } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { CartView } from '@/lib/cart';
import DeliveryChargeLine from './DeliveryChargeLine';

interface Props {
  cart: CartView;
  onCheckout: () => void;
}

/** Totals exactly as returned by the server; shipping and GST are computed when the order is placed. */
export default function CartSummary({ cart, onCheckout }: Props) {
  const blocked = cart.items.some((i) => !i.available);

  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-4">Order summary</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal ({cart.item_count} items)</span>
          <span>{formatPrice(cart.subtotal_paise)}</span>
        </div>
        {cart.discount_paise > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Discount{cart.coupon?.code ? ` (${cart.coupon.code})` : ''}</span>
            <span>–{formatPrice(cart.discount_paise)}</span>
          </div>
        )}
        <DeliveryChargeLine />
        <p className="text-xs text-gray-500 pt-1">
          Final delivery charge and GST are confirmed for your delivery address when you place the order.
        </p>
      </div>

      {blocked && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5 mt-3">
          Some items are unavailable. Remove them or adjust the quantity to continue.
        </p>
      )}

      <button
        onClick={onCheckout}
        disabled={blocked || cart.items.length === 0}
        className="btn-primary w-full mt-4 py-3 flex items-center justify-center gap-2 text-base"
      >
        Proceed to checkout <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
