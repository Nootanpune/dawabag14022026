import { chooseSeller, ownStockFirst, SellerCandidate } from './sellerSelection';

const own = (over: Partial<SellerCandidate> = {}): SellerCandidate =>
  ({ sellerType: 'dawabag', partnerId: null, distanceKm: 20, rating: 5, expiryDate: '2027-06-30', ...over });
const partner = (id: string, over: Partial<SellerCandidate> = {}): SellerCandidate =>
  ({ sellerType: 'partner', partnerId: id, distanceKm: 5, rating: 4, expiryDate: '2027-03-31', ...over });

describe('ownStockFirst (owner rule: > ₹10,000 and Dawabag within 24 h)', () => {
  const base = { minOrderValuePaise: 1000000, maxDeliveryHours: 24 };
  it('applies only above the threshold and when Dawabag delivers in time', () => {
    expect(ownStockFirst({ ...base, orderValuePaise: 1000001, dawabagDeliveryHours: 24 })).toBe(true);
    expect(ownStockFirst({ ...base, orderValuePaise: 1000000, dawabagDeliveryHours: 12 })).toBe(false);
    expect(ownStockFirst({ ...base, orderValuePaise: 5000000, dawabagDeliveryHours: 48 })).toBe(false);
    expect(ownStockFirst({ ...base, orderValuePaise: 5000000, dawabagDeliveryHours: null })).toBe(false);
  });
});

describe('chooseSeller', () => {
  it('uses Dawabag stock first under the own-first rule, even if a partner is nearer', () => {
    expect(chooseSeller([partner('p1'), own()], true)?.sellerType).toBe('dawabag');
  });

  it('falls back to partners when Dawabag has no stock', () => {
    expect(chooseSeller([partner('p1')], true)?.partnerId).toBe('p1');
  });

  it('otherwise picks the nearest seller, Dawabag included', () => {
    expect(chooseSeller([own({ distanceKm: 20 }), partner('p1', { distanceKm: 5 })], false)?.partnerId).toBe('p1');
    expect(chooseSeller([own({ distanceKm: 3 }), partner('p1', { distanceKm: 5 })], false)?.sellerType).toBe('dawabag');
  });

  it('breaks distance ties by rating, then earliest expiry', () => {
    const a = partner('a', { distanceKm: 5, rating: 3 });
    const b = partner('b', { distanceKm: 5, rating: 4.5 });
    expect(chooseSeller([a, b], false)?.partnerId).toBe('b');
    const c = partner('c', { distanceKm: 5, rating: 4, expiryDate: '2027-01-31' });
    const d = partner('d', { distanceKm: 5, rating: 4, expiryDate: '2026-12-31' });
    expect(chooseSeller([c, d], false)?.partnerId).toBe('d');
  });

  it('ranks sellers with unknown location last', () => {
    expect(chooseSeller([partner('x', { distanceKm: null }), partner('y', { distanceKm: 40 })], false)?.partnerId).toBe('y');
  });

  it('returns null when nobody has stock', () => {
    expect(chooseSeller([], true)).toBeNull();
  });
});
