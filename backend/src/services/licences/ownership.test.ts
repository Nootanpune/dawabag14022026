// Security review Sprint 34 (High) — a holder reaches only its OWN licence scans
import { ownsLicence } from './register.service';

const partnerA = '11111111-1111-1111-1111-111111111111';
const partnerB = '22222222-2222-2222-2222-222222222222';
const buyerA = '33333333-3333-3333-3333-333333333333';
const buyerB = '44444444-4444-4444-4444-444444444444';

describe('licence ownership', () => {
  it('a buyer owns only their own licence, never another buyer\'s (the old check matched both)', () => {
    expect(ownsLicence({ vendor_id: null, user_id: buyerA }, { userId: buyerA })).toBe(true);
    expect(ownsLicence({ vendor_id: null, user_id: buyerB }, { userId: buyerA })).toBe(false);
    expect(ownsLicence({ vendor_id: partnerA, user_id: null }, { userId: buyerA })).toBe(false);
  });
  it('a partner owns only its own licences', () => {
    expect(ownsLicence({ vendor_id: partnerA, user_id: null }, { vendorId: partnerA })).toBe(true);
    expect(ownsLicence({ vendor_id: partnerB, user_id: null }, { vendorId: partnerA })).toBe(false);
    expect(ownsLicence({ vendor_id: null, user_id: buyerA }, { vendorId: partnerA })).toBe(false);
  });
});
