'use client';
import { BUYER_RESTRICTIONS, RESTRICTION_STAFF_LABELS, restrictionExplanation } from '@/lib/shop/buyerRestriction';
import type { RestrictionChange } from '@/lib/buyerRestriction/api';

/**
 * "Who may buy" and why (Sprint 47): everyone, doctors and hospitals only (verified registration,
 * Drugs Rules r.65(9)(b)), or licensed trade buyers only (checked drug licence, C-14 / C-33).
 * Shared by the online-sale page and the new-product form. A pharmacist decides; `suggested`
 * is only shown (catalogue suggestions import), never chosen for them.
 */
export default function BuyerRestrictionFields({ value, onChange, idPrefix, suggested, onUseSuggested }: {
  value: RestrictionChange;
  onChange: (v: RestrictionChange) => void;
  idPrefix: string;
  suggested?: string | null;
  onUseSuggested?: () => void;
}) {
  const why = restrictionExplanation(value.restriction);
  return (
    <fieldset className="space-y-2" data-testid="buyer-restriction-fields">
      <legend className="text-sm font-medium text-gray-800">Who may buy</legend>
      <div role="radiogroup" className="flex flex-wrap gap-3">
        {BUYER_RESTRICTIONS.map((r) => (
          <label key={r} className="text-sm inline-flex items-center gap-1.5">
            <input type="radio" name={`${idPrefix}-who`} value={r} checked={value.restriction === r} onChange={() => onChange({ ...value, restriction: r })} />
            {RESTRICTION_STAFF_LABELS[r]}
          </label>
        ))}
      </div>
      {suggested && suggested !== value.restriction && (
        <p className="text-xs text-amber-800">
          Suggested — check: {RESTRICTION_STAFF_LABELS[suggested as keyof typeof RESTRICTION_STAFF_LABELS] ?? suggested}
          {onUseSuggested && <button type="button" className="ml-2 underline" onClick={onUseSuggested}>Use</button>}
        </p>
      )}
      {why && <p className="text-xs text-gray-600">{why} Buyers who may not buy it still see it, with the label, but cannot add it.</p>}
      <label htmlFor={`${idPrefix}-who-reason`} className="block text-xs font-medium text-gray-700">Why (recorded with your name)</label>
      <textarea id={`${idPrefix}-who-reason`} rows={2} className="input text-sm" value={value.reason}
        placeholder="e.g. hospital use only: given under specialist supervision"
        onChange={(e) => onChange({ ...value, reason: e.target.value })} />
    </fieldset>
  );
}
