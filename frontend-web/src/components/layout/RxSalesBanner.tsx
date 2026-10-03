'use client';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { emergencyKeys, fetchSalesStatus } from '@/lib/emergencyStop/api';

/**
 * Sprint 38: when Dawabag pauses prescription-medicine sales (emergency stop, owner
 * decision 2026-10-03), every page says so plainly. Asked from the server each time
 * (refreshed every few minutes); nothing is remembered in the browser.
 */
export default function RxSalesBanner() {
  const { data } = useQuery({ queryKey: emergencyKeys.public, queryFn: fetchSalesStatus, staleTime: 60_000, refetchInterval: 300_000, retry: false });
  if (data?.rx_sales !== 'paused') return null;
  return (
    <div role="status" className="bg-amber-100 border-b border-amber-300 text-amber-950 text-sm" data-testid="rx-sales-banner">
      <p className="max-w-6xl mx-auto px-4 py-2 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{data.message}</span>
      </p>
    </div>
  );
}
