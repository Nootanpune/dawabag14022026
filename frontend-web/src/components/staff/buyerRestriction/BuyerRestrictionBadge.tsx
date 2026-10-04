import { RESTRICTION_STAFF_LABELS, type BuyerRestriction } from '@/lib/shop/buyerRestriction';

/** Sprint 47: who may buy a product, for staff lists (nothing loud for "Everyone"). */
export default function BuyerRestrictionBadge({ value }: { value?: string | null }) {
  const v = (value ?? 'everyone') as BuyerRestriction;
  if (v === 'everyone') return <span className="text-xs text-gray-500">Everyone</span>;
  return (
    <span className="inline-block text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-900" data-testid="buyer-restriction-badge">
      {RESTRICTION_STAFF_LABELS[v] ?? v}
    </span>
  );
}
