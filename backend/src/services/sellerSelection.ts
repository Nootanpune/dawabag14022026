// src/services/sellerSelection.ts
// Pure seller-choice rule (docs/DECISIONS.md, 2026-09-30), unit-tested in
// sellerSelection.test.ts. Database access lives in allocation.service.ts.

export interface SellerCandidate {
  sellerType: 'dawabag' | 'partner';
  partnerId: string | null;
  distanceKm: number | null;   // null = location unknown, ranked last
  rating: number;              // 0–5; Dawabag counts as 5
  expiryDate: string;          // ISO date of the batch that would be used
}

export interface OwnFirstRule {
  orderValuePaise: number;
  minOrderValuePaise: number;          // own stock first only ABOVE this value
  dawabagDeliveryHours: number | null; // to the buyer's pincode; null = not served
  maxDeliveryHours: number;
}

export function ownStockFirst(rule: OwnFirstRule): boolean {
  return rule.orderValuePaise > rule.minOrderValuePaise
    && rule.dawabagDeliveryHours != null
    && rule.dawabagDeliveryHours <= rule.maxDeliveryHours;
}

// Returns the chosen candidate, or null when nobody can fill the line.
export function chooseSeller(candidates: SellerCandidate[], ownFirst: boolean): SellerCandidate | null {
  if (candidates.length === 0) return null;
  if (ownFirst) {
    const own = candidates.find((c) => c.sellerType === 'dawabag');
    if (own) return own;
  }
  return [...candidates].sort((a, b) =>
    (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    || b.rating - a.rating
    || a.expiryDate.localeCompare(b.expiryDate)
  )[0];
}
