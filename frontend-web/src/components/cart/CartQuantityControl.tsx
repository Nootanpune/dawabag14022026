'use client';
import { Loader2, Plus, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cannotOrderOnline } from '@/lib/search/api';
import { useCartQuantity, type QtyProduct } from '@/hooks/useCartQuantity';
import QuantityStepper from './QuantityStepper';
import { restrictedForViewer } from '@/lib/shop/buyerRestriction';

interface Props {
  product: QtyProduct;
  /** 'card': full-width button; 'compact': small, for search suggestions */
  variant?: 'card' | 'compact';
  className?: string;
}

/** "Add" until the medicine is in the server cart, then − qty + with the buyer's limit. */
export default function CartQuantityControl({ product, variant = 'card', className }: Props) {
  const { quantity, limits, busy, add, increase, decrease } = useCartQuantity(product);
  const compact = variant === 'compact';
  const blocked = cannotOrderOnline(product.drug_schedule);

  if (quantity > 0) {
    return (
      <div className={cn(compact ? 'shrink-0' : 'w-full', className)}>
        <QuantityStepper name={product.name} quantity={quantity} min={limits.min} max={limits.max} busy={busy}
          onDecrease={decrease} onIncrease={increase} size={compact ? 'sm' : 'md'}
          className={compact ? '' : 'w-full justify-between'} />
        {quantity >= limits.max && !compact && <p className="text-xs text-gray-600 mt-1">{limits.maxMessage}</p>}
      </div>
    );
  }
  // Sprint 47: a product this buyer may not buy (doctors and hospitals only / licensed trade buyers
  // only) has no Add — the server refuses it anyway (403 BUYER_RESTRICTED)
  if (restrictedForViewer(product)) {
    if (compact) return null;
    return (
      <p className={cn('w-full text-center text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg py-2 px-2', className)}
        data-testid="buyer-restricted">
        {product.buyer_restriction_label ?? 'Not available to your account'}
      </p>
    );
  }
  if (compact) {
    if (blocked || !product.in_stock) return null;
    return (
      <button
        type="button"
        aria-label={`Add ${product.name} to cart`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); add(); }}
        disabled={busy}
        className={cn('shrink-0 inline-flex items-center gap-1 rounded-lg border-2 border-brand-600 px-3 h-8 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50', className)}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
        Add
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => add()}
      disabled={!product.in_stock || blocked || busy}
      aria-label={`Add ${product.name} to cart`}
      className={cn('w-full btn-primary flex items-center justify-center gap-2 text-sm py-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed', className)}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShoppingCart className="w-4 h-4" aria-hidden="true" />}
      {blocked ? 'Not available online' : !product.in_stock ? 'Out of stock' : 'Add to cart'}
    </button>
  );
}
