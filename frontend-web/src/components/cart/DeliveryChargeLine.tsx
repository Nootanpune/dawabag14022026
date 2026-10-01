'use client';
import { Truck } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useDeliveryCharge } from '@/hooks/useDeliveryCharge';

/** Delivery charge before checkout, from the server; nothing invented when it has none. */
export default function DeliveryChargeLine() {
  const quote = useDeliveryCharge();

  if (!quote) {
    return (
      <div className="flex justify-between text-gray-600">
        <span className="flex items-center gap-1.5">
          <Truck className="w-4 h-4 text-gray-500" aria-hidden="true" /> Delivery
        </span>
        <span className="text-xs text-gray-500">Shown at checkout</span>
      </div>
    );
  }
  if (!quote.is_serviceable) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-red-700">
        <Truck className="w-4 h-4" aria-hidden="true" /> We do not deliver to {quote.pincode} yet.
      </p>
    );
  }
  return (
    <div className="flex justify-between text-gray-600">
      <span className="flex items-center gap-1.5">
        <Truck className="w-4 h-4 text-gray-500" aria-hidden="true" /> Delivery to {quote.pincode}
      </span>
      <span>{quote.shipping_charge_paise > 0 ? formatPrice(quote.shipping_charge_paise) : 'Free'}</span>
    </div>
  );
}
