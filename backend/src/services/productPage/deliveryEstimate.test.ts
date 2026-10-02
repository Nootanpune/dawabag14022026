import { COLD_CHAIN_NOTE, deliveryLabel, estimatedDeliveryDate, expiryMonthLabel } from './deliveryEstimate';

// 2026-10-05 is a Monday. 10:00 IST = 04:30 UTC; 15:00 IST = 09:30 UTC.
const at = (isoUtc: string) => new Date(isoUtc);
const base = { estimatedDays: 4, ownDeliveryHours: 24, ownStock: true, partnerStock: false, needsPrescriptionCheck: false };

describe('estimated delivery date (Sprint 33)', () => {
  it('uses Dawabag’s own delivery hours when only its stock can supply', () => {
    expect(estimatedDeliveryDate({ ...base, now: at('2026-10-05T04:30:00Z') })).toBe('2026-10-06');
    expect(estimatedDeliveryDate({ ...base, ownDeliveryHours: 48, now: at('2026-10-05T04:30:00Z') })).toBe('2026-10-07');
  });

  it('uses the PIN code’s estimate when Dawabag does not deliver there itself', () => {
    expect(estimatedDeliveryDate({ ...base, ownDeliveryHours: null, now: at('2026-10-05T04:30:00Z') })).toBe('2026-10-09');
  });

  it('takes the slower seller when a partner could supply too (conservative)', () => {
    expect(estimatedDeliveryDate({ ...base, partnerStock: true, now: at('2026-10-05T04:30:00Z') })).toBe('2026-10-09');
    expect(estimatedDeliveryDate({ ...base, ownStock: false, partnerStock: true, now: at('2026-10-05T04:30:00Z') })).toBe('2026-10-09');
  });

  it('adds a day for the pharmacist’s prescription check and after the 2 pm cut-off', () => {
    expect(estimatedDeliveryDate({ ...base, needsPrescriptionCheck: true, now: at('2026-10-05T04:30:00Z') })).toBe('2026-10-07');
    expect(estimatedDeliveryDate({ ...base, now: at('2026-10-05T09:30:00Z') })).toBe('2026-10-07');
    // 23:00 UTC on the 4th is 04:30 IST on the 5th — an Indian day, not a UTC one
    expect(estimatedDeliveryDate({ ...base, now: at('2026-10-04T23:00:00Z') })).toBe('2026-10-06');
  });

  it('never promises a Sunday', () => {
    // Friday 9 Oct + 2 days = Sunday 11 Oct → Monday 12 Oct
    expect(estimatedDeliveryDate({ ...base, ownDeliveryHours: 48, now: at('2026-10-09T04:30:00Z') })).toBe('2026-10-12');
  });

  it('gives no date when nobody can supply', () => {
    expect(estimatedDeliveryDate({ ...base, ownStock: false, partnerStock: false, now: at('2026-10-05T04:30:00Z') })).toBeNull();
  });

  it('reads like a person would say it', () => {
    expect(deliveryLabel('2026-10-06')).toBe('Get it by Tuesday, 6 Oct');
    expect(deliveryLabel('2026-12-31')).toBe('Get it by Thursday, 31 Dec');
  });
});

describe('expiry of the supplied batch (Sprint 33)', () => {
  it('shows the month and year', () => {
    expect(expiryMonthLabel('2027-03')).toBe('Mar 2027');
    expect(expiryMonthLabel('2027-11-30T00:00:00.000Z')).toBe('Nov 2027');
    expect(expiryMonthLabel(new Date(Date.UTC(2028, 0, 31)))).toBe('Jan 2028');
    expect(expiryMonthLabel(null)).toBeNull();
    expect(expiryMonthLabel('soon')).toBeNull();
  });

  it('has the cold-chain note in the owner’s words (C-25)', () => {
    expect(COLD_CHAIN_NOTE).toBe('Delivered in an insulated pack. Keep refrigerated on arrival.');
  });
});
