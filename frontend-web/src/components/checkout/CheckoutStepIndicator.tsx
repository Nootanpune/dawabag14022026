import { MapPin, Upload, CreditCard, ClipboardCheck } from 'lucide-react';
import type { CheckoutStep } from './types';

const STEPS = [
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'prescription', label: 'Prescription', icon: Upload },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'payment', label: 'Payment', icon: CreditCard },
] as const;

const ORDER: Record<CheckoutStep, number> = { address: 0, prescription: 1, review: 2, payment: 3, confirmed: 4 };

/** Where the buyer is in checkout; labels show on phones too. */
export default function CheckoutStepIndicator({ step, showPrescription }: { step: CheckoutStep; showPrescription: boolean }) {
  const steps = STEPS.filter((s) => s.key !== 'prescription' || showPrescription);
  const current = step;
  return (
    <ol className="flex items-start mb-6" aria-label="Checkout steps">
      {steps.map((s, i) => {
        const done = ORDER[step] > ORDER[s.key] && current !== s.key;
        const active = current === s.key;
        return (
          <li key={s.key} className="flex items-start flex-1 last:flex-none" aria-current={active ? 'step' : undefined}>
            <div className={`flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium
                ${active ? 'text-brand-700' : done ? 'text-green-700' : 'text-gray-500'}`}>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs
                  ${active ? 'bg-brand-600 text-white' : done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {done ? '✓' : i + 1}
              </span>
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 mt-3.5 mx-2 ${done ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
