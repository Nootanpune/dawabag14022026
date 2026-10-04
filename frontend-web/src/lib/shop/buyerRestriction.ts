// Sprint 47 — who may buy a product (owner request 2026-10-04). The server decides on every
// path (search, product page, cart, checkout, order changes, refills) and sends, with each
// product, who may buy it, the label buyers see and whether THIS viewer may add it. The
// website only shows that: a restricted product is listed for everyone with its label, and
// buyers who may not buy it get no Add button. Nothing is stored in the browser.

export type BuyerRestriction = 'everyone' | 'practitioners_only' | 'trade_only';

/** The fields the API adds to every buyer-facing product (search, product page, cards). */
export interface BuyerRestrictionFields {
  buyer_restriction?: BuyerRestriction | string;
  /** "Supplied only to doctors and hospitals" / "Supplied only to licensed trade buyers"; null for everyone */
  buyer_restriction_label?: string | null;
  /** false when this viewer (or a guest) may not buy it */
  buyer_may_buy?: boolean;
}

/** The viewer may not add this product (older API answers without the field: allowed). */
export const restrictedForViewer = (p: BuyerRestrictionFields): boolean => p.buyer_may_buy === false;

/** Who may buy it, in a sentence (shown under the label where there is room). */
export function restrictionExplanation(restriction: string | undefined): string | null {
  if (restriction === 'practitioners_only') {
    return 'Dawabag supplies this only to doctors and hospitals whose medical registration we have verified, against a signed written order.';
  }
  if (restriction === 'trade_only') {
    return 'Dawabag supplies this only to retailers and wholesalers with a valid drug licence checked by us, and to verified doctors and hospitals.';
  }
  return null;
}

/** Staff wording (online-sale page, product admin, new-product form, history). */
export const RESTRICTION_STAFF_LABELS: Record<BuyerRestriction, string> = {
  everyone: 'Everyone',
  practitioners_only: 'Doctors and hospitals only',
  trade_only: 'Licensed trade buyers (and doctors / hospitals) only',
};

export const BUYER_RESTRICTIONS: BuyerRestriction[] = ['everyone', 'practitioners_only', 'trade_only'];
export const MIN_RESTRICTION_REASON = 10;
