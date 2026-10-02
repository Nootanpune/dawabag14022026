'use client';
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  name: string;
  quantity: number;
  min: number;
  max: number;
  /** this line's change is on its way (spinner) */
  busy?: boolean;
  /** another change is on its way (buttons wait) */
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** − qty + for a cart line (server cart). At the minimum, − becomes "remove". */
export default function QuantityStepper({ name, quantity, min, max, busy, disabled, onDecrease, onIncrease, size = 'md', className }: Props) {
  const atMin = quantity <= min;
  const btn = cn('flex items-center justify-center text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:hover:bg-transparent',
    size === 'sm' ? 'w-8 h-8' : 'w-10 h-10');
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div
      role="group"
      aria-label={`Quantity of ${name}`}
      className={cn('inline-flex items-center rounded-lg border-2 border-brand-600 bg-white overflow-hidden', className)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" onClick={onDecrease} disabled={busy || disabled} className={btn}
        aria-label={atMin ? `Remove ${name} from cart` : `Decrease quantity of ${name}`}>
        {atMin ? <Trash2 className={icon} aria-hidden="true" /> : <Minus className={icon} aria-hidden="true" />}
      </button>
      <span className={cn('min-w-8 px-1 text-center font-semibold text-gray-900 tabular-nums', size === 'sm' ? 'text-sm' : 'text-base')}
        aria-live="polite" aria-label={`${quantity} in cart`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline" aria-hidden="true" /> : quantity}
      </span>
      <button type="button" onClick={onIncrease} disabled={busy || disabled || quantity >= max} className={btn}
        aria-label={`Increase quantity of ${name}`}>
        <Plus className={icon} aria-hidden="true" />
      </button>
    </div>
  );
}
