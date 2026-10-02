import { DEMO_CARD, demoCardExpiry } from '@/lib/payments/demoCheckout';
import PayButton from './PayButton';

const Field = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <label className={className}>
    <span className="block text-xs font-medium text-gray-700 mb-0.5">{label}</span>
    <input value={value} readOnly aria-readonly="true" tabIndex={-1} autoComplete="off"
      className="input w-full bg-gray-100 text-gray-700 cursor-not-allowed" />
  </label>
);

/** Card: a fixed test card, read-only — a real card can never be typed here. */
export default function CardStep({ amountPaise, onPay }: { amountPaise: number; onPay: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-2">
        Demo — do not enter a real card. A test card is filled in and cannot be changed.
      </p>
      <div className="grid grid-cols-2 gap-2" aria-label="Demo test card">
        <Field label="Card number" value={DEMO_CARD.number} className="col-span-2" />
        <Field label="Expiry (MM/YY)" value={demoCardExpiry()} />
        <Field label="CVV" value={DEMO_CARD.cvv} />
        <Field label="Name on card" value={DEMO_CARD.name} className="col-span-2" />
      </div>
      <PayButton amountPaise={amountPaise} onClick={onPay} />
    </div>
  );
}
