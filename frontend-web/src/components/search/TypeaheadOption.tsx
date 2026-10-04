'use client';
import { cn, formatPrice } from '@/lib/utils';
import { isRxSchedule } from '@/lib/drugSchedule';
import type { SearchProduct } from '@/lib/search/api';
import ProductImage from '@/components/shop/ProductImage';
import CartQuantityControl from '@/components/cart/CartQuantityControl';

interface Props {
  id: string;
  product: SearchProduct;
  active: boolean;
  onOpen: () => void;
  onHover: () => void;
}

/** One suggestion: name, generic name, price, Rx badge, stock and a quick "Add" that becomes − qty +. */
export default function TypeaheadOption({ id, product, active, onOpen, onHover }: Props) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}   // keep focus in the input
      onMouseEnter={onHover}
      onClick={onOpen}
      className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer', active ? 'bg-brand-50' : 'hover:bg-gray-50')}
    >
      <span aria-hidden="true" className="shrink-0">
        <ProductImage name={product.name} imageUrl={product.image_url} size="sm" className="!w-10 !h-10 [&>span:first-child]:!text-base [&>span:nth-child(2)]:hidden" />
      </span>
      {/* Name, generic + Rx and price stacked, so the − qty + always has room on a phone */}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900 line-clamp-2">{product.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          {product.generic_name && <span className="truncate">{product.generic_name}</span>}
          {/* Prescription medicines (Schedule H / H1): the pharmacist checks the prescription before dispatch (C-08) */}
          {isRxSchedule(product.drug_schedule) && <span className="badge-schedule-h shrink-0">Rx</span>}
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          <span className="text-sm font-semibold text-brand-700">{formatPrice(product.display_price_paise)}</span>
          {!product.in_stock && <span className="text-xs font-medium text-red-700">Out of stock</span>}
          {/* Sprint 47: who may buy it */}
          {product.buyer_restriction_label && <span className="text-xs font-medium text-amber-800">{product.buyer_restriction_label}</span>}
        </span>
      </span>
      {/* Pointer shortcut; keyboard users press Enter to open the product page, or use the results page */}
      <CartQuantityControl product={product} variant="compact" />
    </li>
  );
}
