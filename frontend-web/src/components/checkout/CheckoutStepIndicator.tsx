import { MapPin, Upload, CreditCard } from 'lucide-react';
import type { CheckoutStep } from './types';

const STEPS = [
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'prescription', label: 'Prescription', icon: Upload },
  { key: 'payment', label: 'Payment', icon: CreditCard },
] as const;

const ORDER: Record<CheckoutStep, number> = { address: 0, prescription: 1, payment: 2, confirmed: 3 };

export default function CheckoutStepIndicator({ step, showPrescription }: { step: CheckoutStep; showPrescription: boolean }) {
  const steps = STEPS.filter((s) => s.key !== 'prescription' || showPrescription);
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, i) => {
        const done = ORDER[step] > ORDER[s.key];
        const active = step === s.key;
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div
              className={`flex items-center gap-2 text-sm font-medium
                ${active ? 'text-brand-600' : done ? 'text-green-600' : 'text-gray-400'}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs
                  ${active ? 'bg-brand-600 text-white' : done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
              >
                {done ? '✓' : i + 1}
              </div>
              <span className="hidden sm:block">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${done ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}
