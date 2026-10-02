'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { fetchTradePrices, tradePauseText, tradePriceKeys } from '@/lib/shop/tradePrices';

/** Sprint 32: shown to a retailer / wholesaler whose drug licence has lapsed — the prices
 *  on the page are retail until a renewal is checked (decided by the server, C-14). */
export default function TradePriceBanner({ className = '' }: { className?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const customerType = useAuthStore((s) => s.user?.customer_type);
  const trade = customerType === 'b2b_retailer' || customerType === 'b2b_wholesaler';
  const { data } = useQuery({
    queryKey: tradePriceKeys.status, queryFn: fetchTradePrices,
    enabled: isAuthenticated && trade, staleTime: 0, gcTime: 0,
  });
  if (!data?.paused || !data.licence) return null;
  return (
    <div role="status" data-testid="trade-price-banner"
      className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ${className}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
      <p>
        {tradePauseText(data.licence)}.{' '}
        <Link href="/account/licences" className="font-medium underline underline-offset-2">Send the renewed licence</Link>
      </p>
    </div>
  );
}
