'use client';
import { Gift } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { FreeDelivery } from '@/lib/cart';

/** "Add ₹X more for free delivery" — amounts come from the server's cart (setting delivery.free_above_paise). */
export default function FreeDeliveryProgress({ offer }: { offer: FreeDelivery }) {
  const reached = offer.remaining_paise === 0;
  const pct = Math.min(100, Math.round(((offer.above_paise - offer.remaining_paise) / offer.above_paise) * 100));
  return (
    <div className="rounded-lg bg-brand-50 px-3 py-2.5 text-brand-800">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Gift className="w-4 h-4" aria-hidden="true" />
        {reached
          ? 'You get free delivery on this order'
          : `Add ${formatPrice(offer.remaining_paise)} more for free delivery`}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-label={`Free delivery on medicines of ${formatPrice(offer.above_paise)} or more`}>
        <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-brand-700">Free delivery on medicines of {formatPrice(offer.above_paise)} or more.</p>
    </div>
  );
}
