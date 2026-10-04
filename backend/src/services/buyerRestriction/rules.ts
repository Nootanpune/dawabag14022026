// Who may buy a product — pure rules (Sprint 47, owner request 2026-10-04). No database
// imports: unit-tested in rules.test.ts.
//
// Some products are for hospital use only (e.g. thrombolytics, neonatal lung surfactants,
// chemotherapy and monoclonal antibody injections, intravesical BCG, labour-induction
// pessaries, intravitreal injections) or are supplied only under a controlled supply
// programme. WHICH products are restricted is the owner's decision (DECISIONS 2026-10-04);
// this is the control, and every product starts as 'everyone' (unchanged behaviour).
//
//   everyone           — any buyer, subject to every other rule
//   practitioners_only — doctors / medical institutions whose registration Dawabag verified
//                        and is in date (Sprint 44; Drugs Rules 1945 r.65(9)(b); FDA Pune
//                        circular Drug/Wholesalers Memo./16/2026/1). Their written order is
//                        still needed on every order (unchanged).
//   trade_only         — licensed trade buyers: retailers / wholesalers whose KYC is approved
//                        and every checked drug licence is in date (Sprint 30 / 32; C-14,
//                        C-33), and verified doctors / institutions as above.
//
// Who sets it (developer's decision, as online-sale status — DECISIONS 2026-10-04): only a
// Dawabag pharmacist (pharmacist_rx) with a valid registration (Sprint 39 gate), always with
// a reason, both to restrict and to lift. Admins see it and its history. Every change is in
// an append-only log (C-46). The server is authoritative; screens only show it.

export const BUYER_RESTRICTIONS = ['everyone', 'practitioners_only', 'trade_only'] as const;
export type BuyerRestriction = (typeof BUYER_RESTRICTIONS)[number];

export const BUYER_RESTRICTED = 'BUYER_RESTRICTED';
export const MIN_REASON = 10;

/** What a buyer is, as far as restricted products go (worked out live per request). */
export interface BuyerStanding {
  /** a doctor / institution whose registration is verified and in date (Sprint 44) */
  practitioner: boolean;
  /** a retailer / wholesaler with approved KYC and every checked drug licence in date (Sprint 30 / 32) */
  trade: boolean;
}

export const NO_STANDING: BuyerStanding = Object.freeze({ practitioner: false, trade: false });

export const isBuyerRestriction = (v: unknown): v is BuyerRestriction =>
  typeof v === 'string' && (BUYER_RESTRICTIONS as readonly string[]).includes(v);

/** The restriction to apply; anything unknown is treated as the strictest (fail closed). */
export const restrictionOf = (v: unknown): BuyerRestriction => (v == null || v === '' ? 'everyone' : isBuyerRestriction(v) ? v : 'practitioners_only');

/** May this buyer buy a product with this restriction? */
export function buyerMay(restriction: unknown, s: BuyerStanding): boolean {
  const r = restrictionOf(restriction);
  if (r === 'everyone') return true;
  if (r === 'practitioners_only') return s.practitioner;
  return s.practitioner || s.trade;
}

/** The restrictions this buyer may buy (for SQL: constants only, never user input). */
export function allowedRestrictions(s: BuyerStanding): BuyerRestriction[] {
  return BUYER_RESTRICTIONS.filter((r) => buyerMay(r, s));
}

/** SQL boolean (alias p): this buyer may buy the product. Built from the fixed list above. */
export function mayBuySql(alias: string, s: BuyerStanding): string {
  const list = allowedRestrictions(s).map((r) => `'${r}'`).join(', ');
  return `(${alias}.buyer_restriction IN (${list}))`;
}

/** The label buyers see on a restricted product (search, product page, cards); null for everyone. */
export const RESTRICTION_LABELS: Record<BuyerRestriction, string | null> = {
  everyone: null,
  practitioners_only: 'Supplied only to doctors and hospitals',
  trade_only: 'Supplied only to licensed trade buyers',
};

/** Staff wording (product admin, online-sale page, history). */
export const RESTRICTION_STAFF_LABELS: Record<BuyerRestriction, string> = {
  everyone: 'Everyone',
  practitioners_only: 'Doctors and hospitals only',
  trade_only: 'Licensed trade buyers and doctors / hospitals only',
};

export function restrictionLabel(restriction: unknown): string | null {
  return RESTRICTION_LABELS[restrictionOf(restriction)];
}

/** The fields every buyer-facing product carries (search, product page, cards). */
export function restrictionFields(restriction: unknown, s: BuyerStanding) {
  const r = restrictionOf(restriction);
  return { buyer_restriction: r, buyer_restriction_label: RESTRICTION_LABELS[r], buyer_may_buy: buyerMay(r, s) };
}

/** Who the buyer is, for the plain refusal (registered type, not the price type). */
export type BuyerKind = 'customer' | 'practitioner' | 'trade' | 'guest';

export function buyerKindOf(customerType: string | null | undefined): BuyerKind {
  if (!customerType) return 'guest';
  if (customerType === 'doc_hospital') return 'practitioner';
  if (customerType === 'b2b_retailer' || customerType === 'b2b_wholesaler') return 'trade';
  return 'customer';
}

/** The buyer's words when a restricted product cannot be sold to them (403 BUYER_RESTRICTED). */
export function restrictedMessage(name: string, restriction: unknown, kind: BuyerKind): string {
  const r = restrictionOf(restriction);
  const who = r === 'practitioners_only'
    ? 'doctors and hospitals whose medical registration Dawabag has verified'
    : 'licensed trade buyers (retailers and wholesalers with a valid drug licence checked by Dawabag) and verified doctors and hospitals';
  let tail = '';
  if (kind === 'practitioner') tail = ' Your medical registration is not verified or has lapsed: see your registration under Account.';
  else if (kind === 'trade') {
    tail = r === 'practitioners_only' ? '' : ' Your business account or a drug licence is not approved or has lapsed: see Your drug licences under Account.';
  }
  return `${name} is supplied only to ${who}.${tail}`;
}

export interface RestrictionInput { restriction: BuyerRestriction; reason?: string | null }

export function mayDecide(role: string): boolean { return role === 'pharmacist_rx'; }

/** Plain reasons a change cannot be made (empty = fine). */
export function restrictionInputProblems(i: RestrictionInput, role: string, current?: string | null): string[] {
  const p: string[] = [];
  if (!isBuyerRestriction(i.restriction)) return ['Choose everyone, doctors and hospitals only, or licensed trade buyers only'];
  if (!mayDecide(role)) p.push('Only a Dawabag pharmacist may decide who may buy a product');
  if (String(i.reason ?? '').trim().length < MIN_REASON) p.push(`Say why (at least ${MIN_REASON} characters), e.g. "hospital use only: given under specialist supervision"`);
  if (current != null && current === i.restriction) p.push('That is already who may buy it');
  return p;
}

/** A cell of the Sprint 46 catalogue suggestions file (optional column). undefined = blank. */
export function parseRestrictionCell(raw: string): BuyerRestriction | undefined | 'invalid' {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return undefined;
  const map: Record<string, BuyerRestriction> = {
    everyone: 'everyone', all: 'everyone',
    practitioners_only: 'practitioners_only', practitioner_only: 'practitioners_only', doctors_only: 'practitioners_only', hospital_only: 'practitioners_only',
    trade_only: 'trade_only', trade: 'trade_only',
  };
  return map[s] ?? 'invalid';
}
