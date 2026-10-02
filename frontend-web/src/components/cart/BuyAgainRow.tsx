'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, RotateCcw } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { isRxSchedule } from '@/lib/drugSchedule';
import { cartSuggestionKeys, fetchBuyAgain } from '@/lib/shop/cartSuggestions';
import { useAddToCart } from '@/hooks/useCart';
import ProductImage from '@/components/shop/ProductImage';

/** Medicines from the buyer's delivered orders that are not in the cart (server list, C-10 applied). */
export default function BuyAgainRow({ shape }: { shape: string }) {
  const { data = [] } = useQuery({ queryKey: cartSuggestionKeys.buyAgain(shape), queryFn: fetchBuyAgain, staleTime: 30_000 });
  const { addToCart, isPending, pendingProductId } = useAddToCart();
  if (!data.length) return null;

  return (
    <section aria-labelledby="buy-again-heading" className="card">
      <h2 id="buy-again-heading" className="text-sm font-semibold mb-3 flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-brand-600" aria-hidden="true" /> Buy again
      </h2>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {data.map((p) => (
          <li key={p.id} className="w-40 shrink-0 rounded-xl border border-gray-200 p-2.5 flex flex-col">
            <span aria-hidden="true"><ProductImage name={p.name} imageUrl={p.image_url} size="md" className="!h-20" /></span>
            <Link href={`/shop/${p.id}`} className="mt-2 text-xs font-medium text-gray-900 line-clamp-2 hover:text-brand-700">{p.name}</Link>
            <span className="mt-1 flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-brand-700">{formatPrice(p.display_price_paise)}</span>
              {isRxSchedule(p.drug_schedule) && <span className="badge-schedule-h">Rx</span>}
            </span>
            <span className="flex-1" />
            {p.in_stock ? (
              <button type="button" onClick={() => addToCart(p.id, p.name)} disabled={isPending && pendingProductId === p.id}
                aria-label={`Add ${p.name} to cart`}
                className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg border border-brand-600 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
                {isPending && pendingProductId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />} Add
              </button>
            ) : (
              <span className="mt-2 text-xs font-medium text-red-700">Out of stock</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
