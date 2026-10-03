import { RegistrationRecord, registrationInputProblems, registrationStanding } from './rules';

const today = '2026-10-03';
const rec = (o: Partial<RegistrationRecord> = {}): RegistrationRecord => ({
  registration_no: 'MSPC-1', state_council: 'Maharashtra State Pharmacy Council', valid_till: '2027-10-03', status: 'active',
  verified_at: '2026-10-01T00:00:00Z', recorded_before_sprint39: false, ...o,
});

describe('pharmacist registration standing (Sprint 39, C-03)', () => {
  it('verified, active and in date → valid', () => {
    expect(registrationStanding(rec(), 'MSPC-1', today)).toMatchObject({ ok: true, state: 'valid', message: null });
  });
  it('blocks a missing, unverified, lapsed, suspended or expired registration', () => {
    expect(registrationStanding(null, 'MSPC-1', today)).toMatchObject({ ok: false, state: 'missing' });
    expect(registrationStanding(rec({ verified_at: null }), 'MSPC-1', today)).toMatchObject({ ok: false, state: 'unverified' });
    expect(registrationStanding(rec({ status: 'lapsed' }), 'MSPC-1', today)).toMatchObject({ ok: false, state: 'lapsed' });
    expect(registrationStanding(rec({ status: 'suspended' }), 'MSPC-1', today)).toMatchObject({ ok: false, state: 'suspended' });
    expect(registrationStanding(rec({ valid_till: '2026-10-02' }), 'MSPC-1', today)).toMatchObject({ ok: false, state: 'expired' });
  });
  it('valid on its last day', () => {
    expect(registrationStanding(rec({ valid_till: today }), 'MSPC-1', today)).toMatchObject({ ok: true, days_left: 0 });
  });
  it('a changed registration number needs re-verification', () => {
    expect(registrationStanding(rec(), 'mspc-1 ', today).ok).toBe(true);
    expect(registrationStanding(rec(), 'MSPC-2', today)).toMatchObject({ ok: false, state: 'number_changed' });
  });
  it('pharmacists working before Sprint 39 carry on, with a warning, until recorded', () => {
    const s = registrationStanding(rec({ verified_at: null, valid_till: null, state_council: null, recorded_before_sprint39: true }), 'MSPC-1', today);
    expect(s).toMatchObject({ ok: true, state: 'not_recorded' });
    expect(s.message).toMatch(/not yet recorded/);
  });
  it('warns 30 days before expiry', () => {
    expect(registrationStanding(rec({ valid_till: '2026-11-02' }), 'MSPC-1', today).message).toMatch(/expires on 2026-11-02/);
  });
  it('an admin verifies only complete, in-date details', () => {
    expect(registrationInputProblems({ verified: true, state_council: 'MSPC', registration_no: 'X', valid_till: '2027-01-01' }, today)).toEqual([]);
    expect(registrationInputProblems({ verified: true, registration_no: 'X', valid_till: '2027-01-01' }, today).join()).toMatch(/Council/);
    expect(registrationInputProblems({ verified: true, state_council: 'M', registration_no: 'X', valid_till: '2026-01-01' }, today).join()).toMatch(/lapsed/);
    expect(registrationInputProblems({ status: 'gone' }, today).join()).toMatch(/active, lapsed or suspended/);
  });
});
