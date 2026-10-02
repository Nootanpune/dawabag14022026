'use client';
import { Loader2, Plus } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { isRxSchedule } from '@/lib/drugSchedule';
import { cannotOrderOnline, type SearchProduct } from '@/lib/search/api';
import ProductImage from '@/components/shop/ProductImage';

interface Props {
  id: string;
  product: SearchProduct;
  active: boolean;
  adding: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onHover: () => void;
}

/** One suggestion: name, generic name, price, Rx badge, stock and a quick "Add". */
export default function TypeaheadOption({ id, product, active, adding, onOpen, onAdd, onHover }: Props) {
  const canAdd = product.in_stock && !cannotOrderOnline(product.drug_schedule);
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
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900 truncate">{product.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          {product.generic_name && <span className="truncate">{product.generic_name}</span>}
          {/* Prescription medicines (Schedule H / H1): the pharmacist checks the prescription before dispatch (C-08) */}
          {isRxSchedule(product.drug_schedule) && <span className="badge-schedule-h shrink-0">Rx</span>}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-sm font-semibold text-brand-700">{formatPrice(product.display_price_paise)}</span>
        {!product.in_stock && <span className="block text-xs font-medium text-red-700">Out of stock</span>}
      </span>
      {canAdd && (
        // Pointer shortcut; keyboard users press Enter to open the product page, or use the results page
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Add ${product.name} to cart`}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          disabled={adding}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-brand-600 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
          Add
        </button>
      )}
    </li>
  );
}
