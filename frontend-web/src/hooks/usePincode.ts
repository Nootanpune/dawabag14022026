'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { ADDRESSES_QUERY_KEY, fetchAddresses } from '@/lib/addresses';

/**
 * Delivery pincode, never stored on the device.
 * Signed in → the default address pincode from the server (the user may override it for this visit).
 * Guest → whatever they type, kept in memory for this page visit only.
 */
export function usePincode() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [typed, setTyped] = useState<string | null>(null);

  const { data: addresses } = useQuery({
    queryKey: ADDRESSES_QUERY_KEY,
    queryFn: fetchAddresses,
    enabled: isAuthenticated,
  });

  const defaultPincode =
    addresses?.find((a) => a.is_default)?.pincode ?? addresses?.[0]?.pincode ?? '';

  return { pincode: typed ?? defaultPincode, setPincode: setTyped };
}
