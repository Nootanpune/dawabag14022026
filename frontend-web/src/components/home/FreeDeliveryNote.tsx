'use client';
import { useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { deliveryOfferKeys, fetchDeliveryOffer, freeDeliveryLine } from '@/lib/shop/deliveryOffer';

/** "Free delivery on medicines of ₹499 or more" under the home search — only when the
 *  server says free delivery is on; fetched fresh, not kept once the page is left. */
export default function FreeDeliveryNote() {
  const { data } = useQuery({ queryKey: deliveryOfferKeys.offer, queryFn: fetchDeliveryOffer, staleTime: 0, gcTime: 0 });
  const line = freeDeliveryLine(data);
  if (!line) return null;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-800" data-testid="free-delivery-note">
      <Truck className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
      {line}
    </p>
  );
}
