'use client';
import Link from 'next/link';
import { ShoppingCart, Snowflake, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { scheduleBadge } from '@/lib/drugSchedule';

interface Product {
  id: string; name: string; generic_name?: string; sku: string;
  marketed_by?: string; drug_schedule: string; mrp_paise: number;
  offer_price_paise: number; discount_pct: number; in_stock: boolean;
  /** buyer-specific price from the server (offer / PTR / PTS / institutional) */
  display_price_paise: number;
  cold_chain: boolean; s3_image_key?: string; max_qty_per_order: number;
}

interface Props {
  product: Product;
  onAddToCart: (product: Product) => void;
  /** true while this product's add-to-cart request is in flight */
  isAdding?: boolean;
}

const scheduleColors: Record<string, string> = {
  'Schedule H': 'badge-schedule-h',
  'Schedule H1': 'badge-schedule-h',
  'Schedule G': 'text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium',
};

export default function ProductCard({ product, onAddToCart, isAdding }: Props) {
  const cannotOrder = ['NDPS', 'Schedule X'].includes(product.drug_schedule);

  return (
    <div className="card hover:shadow-md transition-shadow flex flex-col">
      {/* Image placeholder */}
      <Link href={`/shop/${product.id}`} className="block mb-3">
        <div className="w-full h-28 rounded-lg bg-brand-50 flex items-center justify-center">
          <span className="text-4xl">💊</span>
        </div>
      </Link>

      {/* Info */}
      <div className="flex-1">
        <Link href={`/shop/${product.id}`}>
          <h3 className="font-medium text-sm text-gray-800 line-clamp-2 hover:text-brand-600 mb-1">
            {product.name}
          </h3>
        </Link>
        {product.marketed_by && (
          <p className="text-xs text-gray-500 mb-2">{product.marketed_by}</p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {/* Schedule badge only for scheduled drugs — none for OTC */}
          {scheduleBadge(product.drug_schedule) && (
            <span className={scheduleColors[product.drug_schedule] || 'badge-schedule-h'}>
              {scheduleBadge(product.drug_schedule)}
            </span>
          )}
          {product.cold_chain && (
            <span className="badge-cold flex items-center gap-0.5">
              <Snowflake className="w-3 h-3" /> Cold chain
            </span>
          )}
          {!product.in_stock && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
              Out of stock
            </span>
          )}
        </div>

        {/* Price — always the server's buyer-specific display price */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base font-semibold text-brand-600">
            {formatPrice(product.display_price_paise)}
          </span>
          {product.mrp_paise > product.display_price_paise && (
            <span className="text-xs text-gray-400 line-through">{formatPrice(product.mrp_paise)}</span>
          )}
          {product.discount_pct > 0 && product.display_price_paise === product.offer_price_paise && (
            <span className="text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
              {product.discount_pct}% off
            </span>
          )}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => onAddToCart(product)}
        disabled={!product.in_stock || cannotOrder || isAdding}
        className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2
                   disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
        {cannotOrder ? 'Not available online' : !product.in_stock ? 'Out of stock' : 'Add to cart'}
      </button>
    </div>
  );
}
