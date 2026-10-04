'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Loader2, ShoppingCart, Minus, Plus, Check } from 'lucide-react';
import type { ProductDetail } from '@/lib/products/api';
import { formatPrice } from '@/lib/utils';
import { useCartQuantity } from '@/hooks/useCartQuantity';
import QuantityStepper from '@/components/cart/QuantityStepper';
import { restrictedForViewer } from '@/lib/shop/buyerRestriction';
import BuyerRestrictionNote from './BuyerRestrictionNote';

/** Product page: choose how many, then Add; once in the cart, − qty + and "Go to cart". */
export default function ProductBuyBox({ p }: { p: ProductDetail }) {
  const product = { ...p, drug_schedule: p.drug_schedule ?? 'OTC' };
  const { quantity, limits, busy, add, increase, decrease } = useCartQuantity(product);
  const [chosen, setChosen] = useState(limits.min);
  const qty = Math.min(Math.max(chosen, limits.min), limits.max);

  if (p.cannot_order_online) return <p className="text-sm text-red-700 mt-3">This medicine cannot be ordered online.</p>;
  // Sprint 47: who may buy it — the label and who it is for; no Add for a buyer who may not (server-decided)
  const note = <BuyerRestrictionNote product={p} detail className="mt-3" />;
  if (restrictedForViewer(p) && !quantity) return note;
  if (!p.in_stock && !quantity) return <p className="text-sm font-medium text-red-700 mt-3">Out of stock right now. Please check again later.</p>;

  if (quantity > 0) {
    return (
      <div className="mt-3 space-y-2">
        {note}
        <p className="text-sm font-medium text-green-800 flex items-center gap-1"><Check className="w-4 h-4" aria-hidden="true" /> In your cart</p>
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper name={p.name} quantity={quantity} min={limits.min} max={limits.max} busy={busy}
            onDecrease={decrease} onIncrease={increase} />
          <Link href="/cart" className="btn-primary inline-flex items-center gap-2"><ShoppingCart className="w-4 h-4" aria-hidden="true" /> Go to cart</Link>
        </div>
        {quantity >= limits.max && <p className="text-xs text-gray-600">{limits.maxMessage}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {note}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Choose quantity" className="inline-flex items-center rounded-lg border border-gray-300 bg-white">
          <button type="button" onClick={() => setChosen(qty - 1)} disabled={qty <= limits.min}
            aria-label="One less" className="w-10 h-10 flex items-center justify-center disabled:opacity-40">
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <label htmlFor="buy-qty" className="sr-only">Quantity</label>
          <select id="buy-qty" value={qty} onChange={(e) => setChosen(Number(e.target.value))}
            className="h-10 px-2 text-base font-semibold bg-transparent border-x border-gray-200 focus:outline-none">
            {Array.from({ length: Math.min(limits.max, limits.min + 49) - limits.min + 1 }, (_, i) => limits.min + i).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button type="button" onClick={() => setChosen(qty + 1)} disabled={qty >= limits.max}
            aria-label="One more" className="w-10 h-10 flex items-center justify-center disabled:opacity-40">
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <button type="button" onClick={() => add(qty)} disabled={busy} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShoppingCart className="w-4 h-4" aria-hidden="true" />}
          Add {qty > 1 ? `${qty} ` : ''}to cart · {formatPrice(p.price_paise * qty)}
        </button>
      </div>
      <p className="text-xs text-gray-600">
        {limits.minMessage ? `${limits.minMessage} ` : ''}Up to {limits.max} per order.
      </p>
    </div>
  );
}
