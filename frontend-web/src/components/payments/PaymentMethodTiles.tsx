'use client';
import { Building2, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { METHOD_LABELS, type PaymentMethod } from '@/lib/payments/api';

const ICONS: Record<PaymentMethod, typeof CreditCard> = { upi: Smartphone, card: CreditCard, netbanking: Building2, wallet: Wallet };

/** The ways to pay, as large tiles (one chosen). */
export default function PaymentMethodTiles({ methods, value, onChange }: { methods: PaymentMethod[]; value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
      {methods.map((m) => {
        const Icon = ICONS[m];
        const on = value === m;
        return (
          <button key={m} type="button" role="radio" aria-checked={on} onClick={() => onChange(m)}
            className={cn('text-left rounded-xl border-2 p-3 flex items-start gap-2 transition-colors',
              on ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:border-brand-300 bg-white')}>
            <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', on ? 'text-brand-700' : 'text-gray-500')} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-gray-900">{METHOD_LABELS[m].title}</span>
              <span className="block text-xs text-gray-600">{METHOD_LABELS[m].hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
