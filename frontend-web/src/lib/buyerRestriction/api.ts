// Sprint 47 — staff side of "who may buy" a product. Lives on the server only; only a Dawabag
// pharmacist with a valid registration changes it, always with a reason; admins see it and its
// history (append-only, C-46). Buyers' screens only show what the server sends.
import api from '../api';
import { MIN_RESTRICTION_REASON, type BuyerRestriction } from '../shop/buyerRestriction';

export interface RestrictionChange { restriction: BuyerRestriction; reason: string }

export interface RestrictionLogRow {
  old_restriction: BuyerRestriction | null;
  new_restriction: BuyerRestriction;
  reason: string;
  set_at: string;
  set_by_name: string | null;
}

export const buyerRestrictionKeys = {
  all: ['buyer-restriction'] as const,
  log: (id: string) => ['buyer-restriction', 'log', id] as const,
};

export async function setBuyerRestriction(productId: string, change: RestrictionChange) {
  const { data } = await api.put(`/buyer-restriction/products/${productId}`, change);
  return data.data as { id: string; buyer_restriction: BuyerRestriction; previous: BuyerRestriction };
}

export async function fetchBuyerRestrictionLog(productId: string) {
  const { data } = await api.get(`/buyer-restriction/products/${productId}/log`);
  return data.data as RestrictionLogRow[];
}

/** What is missing before the change can be sent (the server checks the same). */
export function restrictionProblem(c: RestrictionChange, current?: string | null): string | null {
  if (current && c.restriction === current) return 'That is already who may buy it.';
  if (c.reason.trim().length < MIN_RESTRICTION_REASON) return `Say why (at least ${MIN_RESTRICTION_REASON} characters).`;
  return null;
}
