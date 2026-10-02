'use client';
import type { ReactNode } from 'react';
import { Trash2, AlertTriangle, Snowflake } from 'lucide-react';
import { formatPrice, cn } from '@/lib/utils';
import type { CartLine } from '@/lib/cart';
import { scheduleBadge } from '@/lib/drugSchedule';
import ProductImage from '@/components/shop/ProductImage';
import { quantityLimits } from '@/lib/shop/quantity';
import QuantityStepper from './QuantityStepper';

interface Props {
  line: CartLine;
  disabled?: boolean;
  /** this line is being changed */
  busy?: boolean;
  onQuantityChange: (quantity: number) => void;
  /** e.g. a cheaper option with the same medicine (Sprint 25) */
  suggestion?: ReactNode;
}

/** One cart line exactly as the server priced it. */
export default function CartLineItem({ line, disabled, busy, onQuantityChange, suggestion }: Props) {
  const isRx = ['Schedule H', 'Schedule H1'].includes(line.drug_schedule);
  // The buyer's own limits from the server cart line (buyer type, stock)
  const limits = quantityLimits({}, line);

  return (
    <div className={cn('card flex gap-4', !line.available && 'border-red-200 bg-red-50/40')}>
      <ProductImage name={line.name} imageUrl={line.image_url} size="sm" />
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm line-clamp-2">{line.name}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{line.sku}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {scheduleBadge(line.drug_schedule) && (
            <span className={isRx ? 'badge-schedule-h' : 'badge-otc'}>{scheduleBadge(line.drug_schedule)}</span>
          )}
          {line.cold_chain && (
            <span className="badge-cold flex items-center gap-0.5">
              <Snowflake className="w-3 h-3" /> Cold chain
            </span>
          )}
          <span className="text-xs text-gray-500">
            {formatPrice(line.unit_price_paise)} each
            {line.mrp_paise > line.unit_price_paise && (
              <span className="line-through text-gray-400 ml-1">{formatPrice(line.mrp_paise)}</span>
            )}
          </span>
        </div>

        {line.issue && (
          <p className="text-xs text-red-600 mt-1.5 flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {line.issue}
          </p>
        )}

        <div className="flex items-center justify-between mt-2">
          <QuantityStepper
            name={line.name}
            quantity={line.quantity}
            min={limits.min}
            max={limits.max}
            busy={busy}
            disabled={disabled}
            size="sm"
            onDecrease={() => onQuantityChange(line.quantity <= limits.min ? 0 : line.quantity - 1)}
            onIncrease={() => onQuantityChange(line.quantity + 1)}
          />
          <span className="font-semibold text-brand-600">{formatPrice(line.line_subtotal_paise)}</span>
        </div>
        {line.available && line.quantity >= limits.max && <p className="text-xs text-gray-600 mt-1">{limits.maxMessage}</p>}
        {limits.minMessage && <p className="text-xs text-gray-600 mt-1">{limits.minMessage}</p>}
        {suggestion}
      </div>
      <button
        onClick={() => onQuantityChange(0)}
        disabled={disabled}
        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 self-start"
        aria-label={`Remove ${line.name}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
