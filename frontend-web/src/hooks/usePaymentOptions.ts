'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchPaymentOptions, paymentKeys } from '@/lib/payments/api';
import { useAuthStore } from '@/store/authStore';

/** How this server takes payment (Razorpay, trial demo, or not available). Asked only when signed in (Sprint 43 QA: no 401s for visitors). */
export function usePaymentOptions() {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  return useQuery({ queryKey: paymentKeys.options, queryFn: fetchPaymentOptions, staleTime: 5 * 60_000, enabled: signedIn, retry: false });
}
