'use client';
import { Building2, ChevronRight, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { METHOD_LABELS, type PaymentMethod } from '@/lib/payments/api';

const ICONS: Record<PaymentMethod, typeof CreditCard> = { upi: Smartphone, card: CreditCard, netbanking: Building2, wallet: Wallet };

/** The ways to pay, as large tiles; choosing one opens that method's step (as in Razorpay's window). */
export default function PaymentMethodTiles({ methods, onChoose }: { methods: PaymentMethod[]; onChoose: (m: PaymentMethod) => void }) {
  return (
    <ul aria-label="Ways to pay" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {methods.map((m) => {
        const Icon = ICONS[m];
        return (
          <li key={m}>
            <button type="button" onClick={() => onChoose(m)}
              className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-brand-400 bg-white p-3 flex items-center gap-2 transition-colors">
              <Icon className="w-5 h-5 shrink-0 text-brand-700" aria-hidden="true" />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-gray-900">{METHOD_LABELS[m].title}</span>
                <span className="block text-xs text-gray-600">{METHOD_LABELS[m].hint}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
