'use client';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { usePincode } from './usePincode';

export interface DeliveryQuote {
  pincode: string;
  is_serviceable: boolean;
  estimated_days: number;
  shipping_charge_paise: number;
}

// Credit-terms buyers may get free shipping on large orders, decided only when the
// order is placed — so no figure is shown to them here.
const B2B_TYPES = ['b2b_retailer', 'b2b_wholesaler'];

/**
 * Delivery charge for the buyer's default-address pincode, read from the server's
 * serviceability table (GET /products/search pincode_info). null when the server
 * has no figure for it — the charge is then shown at checkout, never guessed.
 */
export function useDeliveryCharge(): DeliveryQuote | null {
  const { pincode } = usePincode();
  const customerType = useAuthStore((s) => s.user?.customer_type);
  const b2b = B2B_TYPES.includes(customerType ?? '');
  const { data } = useQuery({
    queryKey: ['pincode-info', pincode],
    queryFn: async () => {
      const { data } = await api.get(`/products/search?pincode=${encodeURIComponent(pincode)}&limit=1`);
      return (data.data?.pincode_info ?? null) as Omit<DeliveryQuote, 'pincode'> | null;
    },
    enabled: /^\d{6}$/.test(pincode) && !b2b,
  });
  if (b2b || !data || typeof data.shipping_charge_paise !== 'number') return null;
  return { pincode, ...data };
}
