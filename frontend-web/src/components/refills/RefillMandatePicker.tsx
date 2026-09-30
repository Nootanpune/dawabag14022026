'use client';
import type { Mandate, Refill } from '@/lib/refills';
import { formatPrice } from '@/lib/utils';

/** Attach one of the buyer's active mandates to a refill (or pay by link). */
export default function RefillMandatePicker({
  refill,
  mandates,
  disabled,
  onChange,
}: {
  refill: Refill;
  mandates: Mandate[];
  disabled?: boolean;
  onChange: (mandateId: string | null) => void;
}) {
  const active = mandates.filter((m) => m.status === 'active');
  if (!active.length && !refill.mandate_id) {
    return <p className="text-xs text-gray-500">Payment: we&apos;ll send you a link to pay on each refill.</p>;
  }
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
      Payment:
      <select
        value={refill.mandate_id ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="input w-auto py-1 text-xs"
      >
        <option value="">Send me a link to pay</option>
        {active.map((m) => (
          <option key={m.id} value={m.id}>
            Automatic — {m.method.toUpperCase()} up to {formatPrice(m.max_amount_paise)}
          </option>
        ))}
        {refill.mandate_id && !active.some((m) => m.id === refill.mandate_id) && (
          <option value={refill.mandate_id}>Automatic ({refill.mandate_status ?? 'inactive'})</option>
        )}
      </select>
    </label>
  );
}
