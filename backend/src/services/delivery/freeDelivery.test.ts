import { freeDeliveryProgress, qualifiesForFreeDelivery } from './freeDelivery';

describe('retail free delivery', () => {
  it('is free from the amount, not just above it', () => {
    expect(qualifiesForFreeDelivery(49900, 49900)).toBe(true);
    expect(qualifiesForFreeDelivery(49900, 49899)).toBe(false);
  });
  it('is off when no amount is set', () => {
    expect(qualifiesForFreeDelivery(null, 10_000_000)).toBe(false);
    expect(freeDeliveryProgress(null, 100)).toBeNull();
  });
  it('tells the cart how much more is needed', () => {
    expect(freeDeliveryProgress(49900, 4000)).toEqual({ above_paise: 49900, remaining_paise: 45900 });
    expect(freeDeliveryProgress(49900, 60000)).toEqual({ above_paise: 49900, remaining_paise: 0 });
  });
});
