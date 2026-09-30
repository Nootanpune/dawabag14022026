'use client';
import { ShoppingCart, Snowflake, Loader2 } from 'lucide-react';
import type { ProductDetail } from '@/lib/products/api';
import { formatPrice } from '@/lib/utils';
import { scheduleBadge } from '@/lib/drugSchedule';
import { useAddToCart } from '@/hooks/useCart';

/** Name, the buyer's own price and add-to-cart. Copy appears only once a pharmacist approved it (C-19). */
export default function ProductSummary({ p }: { p: ProductDetail }) {
  const { addToCart, isPending } = useAddToCart();
  const badge = scheduleBadge(p.drug_schedule);
  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-40 h-40 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
          <span className="text-5xl">💊</span>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{p.name}</h1>
          {p.generic_name && <p className="text-sm text-gray-500">{p.generic_name}</p>}
          {p.composition && <p className="text-xs text-gray-500 mt-1">Composition: {p.composition}</p>}
          <div className="flex flex-wrap gap-1 mt-2">
            {badge && <span className="badge-schedule-h">{badge}</span>}
            {p.cold_chain && (
              <span className="badge-cold inline-flex items-center gap-1">
                <Snowflake className="w-3 h-3" /> Cold chain
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-brand-700">{formatPrice(p.price_paise)}</span>
            {p.mrp_paise > p.price_paise && (
              <>
                <span className="text-sm text-gray-400 line-through">MRP {formatPrice(p.mrp_paise)}</span>
                <span className="text-sm text-green-700">{p.discount_pct}% off</span>
              </>
            )}
          </div>
          {p.requires_prescription && <p className="text-xs text-amber-700 mt-1">Prescription required</p>}
          {p.cannot_order_online ? (
            <p className="text-sm text-red-700 mt-3">This medicine cannot be ordered online.</p>
          ) : (
            <button
              onClick={() => addToCart(p.id, p.name)}
              disabled={!p.in_stock || isPending}
              className="btn-primary mt-3 inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              {p.in_stock ? 'Add to cart' : 'Out of stock'}
            </button>
          )}
        </div>
      </div>
      {p.description ? (
        <p className="text-sm text-gray-700 mt-4 whitespace-pre-line">{p.description}</p>
      ) : (
        <p className="text-xs text-gray-400 mt-4">Product information is awaiting pharmacist review.</p>
      )}
    </div>
  );
}
