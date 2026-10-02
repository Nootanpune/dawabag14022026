'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import PayButton from './PayButton';

/** Netbanking or wallet: choose a bank / wallet from the server's list, then Pay. */
export default function ProviderStep({ label, providers, amountPaise, onPay }:
  { label: string; providers: string[]; amountPaise: number; onPay: (provider: string) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {providers.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={chosen === p} onClick={() => setChosen(p)}
            className={cn('rounded-xl border-2 p-3 text-sm font-semibold text-left',
              chosen === p ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-800 hover:border-brand-300')}>
            {p}
          </button>
        ))}
      </div>
      {!chosen && <p className="text-xs text-gray-500">Choose one to continue.</p>}
      <PayButton amountPaise={amountPaise} disabled={!chosen} onClick={() => chosen && onPay(chosen)} />
    </div>
  );
}
