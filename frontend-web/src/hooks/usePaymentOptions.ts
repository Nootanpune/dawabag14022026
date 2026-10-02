'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchPaymentOptions, paymentKeys } from '@/lib/payments/api';

/** How this server takes payment (Razorpay, trial demo, or not available). */
export function usePaymentOptions() {
  return useQuery({ queryKey: paymentKeys.options, queryFn: fetchPaymentOptions, staleTime: 5 * 60_000 });
}
