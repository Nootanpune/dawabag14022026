import {
  BUYER_RESTRICTIONS, NO_STANDING, allowedRestrictions, buyerKindOf, buyerMay, mayBuySql, parseRestrictionCell,
  restrictedMessage, restrictionFields, restrictionInputProblems, restrictionOf,
} from './rules';

const consumer = NO_STANDING;
const doctor = { practitioner: true, trade: false };
const retailer = { practitioner: false, trade: true };

describe('who may buy (Sprint 47)', () => {
  it('everyone: every buyer, guests too (unchanged behaviour)', () => {
    for (const s of [consumer, doctor, retailer]) expect(buyerMay('everyone', s)).toBe(true);
    expect(buyerMay(null, consumer)).toBe(true);
  });
  it('practitioners_only: only a verified doctor / institution', () => {
    expect(buyerMay('practitioners_only', doctor)).toBe(true);
    expect(buyerMay('practitioners_only', retailer)).toBe(false);
    expect(buyerMay('practitioners_only', consumer)).toBe(false);
  });
  it('trade_only: licensed trade buyers and verified practitioners', () => {
    expect(buyerMay('trade_only', retailer)).toBe(true);
    expect(buyerMay('trade_only', doctor)).toBe(true);
    expect(buyerMay('trade_only', consumer)).toBe(false);
  });
  it('an unknown value fails closed (strictest)', () => {
    expect(restrictionOf('hospital')).toBe('practitioners_only');
    expect(buyerMay('hospital', retailer)).toBe(false);
  });
  it('SQL lists only the fixed values this buyer may buy', () => {
    expect(allowedRestrictions(consumer)).toEqual(['everyone']);
    expect(allowedRestrictions(retailer)).toEqual(['everyone', 'trade_only']);
    expect(allowedRestrictions(doctor)).toEqual([...BUYER_RESTRICTIONS]);
    expect(mayBuySql('p', consumer)).toBe("(p.buyer_restriction IN ('everyone'))");
  });
  it('buyer fields: label for restricted products, none for everyone', () => {
    expect(restrictionFields('everyone', consumer)).toEqual({ buyer_restriction: 'everyone', buyer_restriction_label: null, buyer_may_buy: true });
    expect(restrictionFields('practitioners_only', consumer)).toEqual({
      buyer_restriction: 'practitioners_only', buyer_restriction_label: 'Supplied only to doctors and hospitals', buyer_may_buy: false });
    expect(restrictionFields('trade_only', retailer).buyer_restriction_label).toBe('Supplied only to licensed trade buyers');
  });
  it('plain refusal, with a hint for an unverified doctor or a lapsed trade account', () => {
    expect(restrictedMessage('X Inj', 'practitioners_only', 'customer')).toMatch(/^X Inj is supplied only to doctors and hospitals/);
    expect(restrictedMessage('X Inj', 'practitioners_only', 'practitioner')).toMatch(/registration is not verified or has lapsed/);
    expect(restrictedMessage('X Inj', 'trade_only', 'trade')).toMatch(/drug licence is not approved or has lapsed/);
    expect(buyerKindOf('doc_hospital')).toBe('practitioner');
    expect(buyerKindOf('b2b_wholesaler')).toBe('trade');
    expect(buyerKindOf(undefined)).toBe('guest');
  });
  it('only a pharmacist decides, always with a reason; no change to the same value', () => {
    expect(restrictionInputProblems({ restriction: 'practitioners_only', reason: 'Hospital use only under specialist care' }, 'pharmacist_rx', 'everyone')).toEqual([]);
    expect(restrictionInputProblems({ restriction: 'practitioners_only', reason: 'Hospital use only under specialist care' }, 'admin', 'everyone').join())
      .toMatch(/Only a Dawabag pharmacist/);
    expect(restrictionInputProblems({ restriction: 'trade_only', reason: 'short' }, 'pharmacist_rx', 'everyone').join()).toMatch(/at least 10/);
    expect(restrictionInputProblems({ restriction: 'everyone', reason: 'Lifted after the owner decided' }, 'pharmacist_rx', 'everyone').join())
      .toMatch(/already/);
    expect(restrictionInputProblems({ restriction: 'nurses' as never, reason: 'x'.repeat(20) }, 'pharmacist_rx')).toHaveLength(1);
  });
  it('the suggestions file cell (Sprint 46 import, optional column)', () => {
    expect(parseRestrictionCell('')).toBeUndefined();
    expect(parseRestrictionCell('Practitioners only')).toBe('practitioners_only');
    expect(parseRestrictionCell('trade-only')).toBe('trade_only');
    expect(parseRestrictionCell('EVERYONE')).toBe('everyone');
    expect(parseRestrictionCell('nurses')).toBe('invalid');
  });
});
