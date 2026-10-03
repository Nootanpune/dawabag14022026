// Sprint 44 — sales to doctors / institutions (Drugs Rules r.65(9)(b); FDA Pune circular 16/2026)
import { nameKey, notCovered, practitionerSnapshot, registrationStanding, requisitionText, typedNameMatches } from './rules';

const doctor = {
  practitioner_kind: 'doctor', nmc_reg_number: 'MMC-1234', nmc_council_state: 'Maharashtra Medical Council', nmc_status: 'verified',
  nmc_valid_till: '2027-03-31', nmc_certificate_key: 'kyc/u/nmc_certificate/x.pdf', nmc_verified_at: new Date('2026-10-01T10:00:00Z'),
  nmc_doctor_name_as_per_register: 'Asha Rao', full_name: 'Dr. Asha Rao', business_name: null,
};
const today = '2026-10-03';

describe('practitioner registration standing', () => {
  it('verified, in date, certificate on file → may be sold to', () => {
    expect(registrationStanding(doctor, today)).toMatchObject({ ok: true, state: 'verified' });
  });
  it('unverified, rejected, suspended, details missing, lapsed → no sale with a plain reason', () => {
    expect(registrationStanding({ ...doctor, nmc_status: 'pending' }, today)).toMatchObject({ ok: false, state: 'not_verified' });
    expect(registrationStanding({ ...doctor, nmc_status: null }, today).ok).toBe(false);
    expect(registrationStanding({ ...doctor, nmc_status: 'rejected' }, today)).toMatchObject({ ok: false, state: 'rejected' });
    expect(registrationStanding({ ...doctor, nmc_status: 'suspended' }, today)).toMatchObject({ ok: false, state: 'suspended' });
    expect(registrationStanding({ ...doctor, nmc_valid_till: null }, today)).toMatchObject({ ok: false, state: 'details_missing' });
    expect(registrationStanding({ ...doctor, nmc_certificate_key: null }, today)).toMatchObject({ ok: false, state: 'details_missing' });
    const lapsed = registrationStanding({ ...doctor, nmc_valid_till: '2026-10-02' }, today);
    expect(lapsed).toMatchObject({ ok: false, state: 'expired' });
    expect(lapsed.message).toMatch(/valid till 2026-10-02/);
    expect(registrationStanding({ ...doctor, nmc_valid_till: today }, today).ok).toBe(true);
  });
  it('an institution also needs its own checked, in-date registration / licence', () => {
    const inst = { ...doctor, practitioner_kind: 'institution', business_name: 'Sunrise Nursing Home' };
    expect(registrationStanding(inst, today, [])).toMatchObject({ ok: false, state: 'institution_unverified' });
    expect(registrationStanding(inst, today, [{ label: 'Other', number: 'BNH-1', valid_upto: '2026-01-01', status: 'verified' }]).ok).toBe(false);
    expect(registrationStanding(inst, today, [{ label: 'Other', number: 'BNH-1', valid_upto: '2028-01-01', status: 'pending' }]).ok).toBe(false);
    expect(registrationStanding(inst, today, [{ label: 'Other', number: 'BNH-1', valid_upto: '2028-01-01', status: 'verified' }]).ok).toBe(true);
    const snap = practitionerSnapshot(inst, [{ label: 'Clinical establishment', number: 'BNH-1', valid_upto: '2028-01-01', status: 'verified' }]);
    expect(snap.institution).toEqual({ name: 'Sunrise Nursing Home', licences: [{ label: 'Clinical establishment', number: 'BNH-1', valid_upto: '2028-01-01' }] });
  });
});

describe('written order', () => {
  it('the typed signature is the name on the register (titles, case and spaces ignored)', () => {
    const snap = practitionerSnapshot(doctor);
    expect(nameKey('Dr. Asha  RAO')).toBe('asharao');
    expect(typedNameMatches('dr asha rao', snap)).toBe(true);
    expect(typedNameMatches('Asha', snap)).toBe(false);
    expect(typedNameMatches('', snap)).toBe(false);
  });
  it('the requisition text names the doctor, registration, items and r.65(9)(b)', () => {
    const t = requisitionText(practitionerSnapshot(doctor), [{ product_id: 'p', product_name: 'Amoxicillin 500', quantity: 20 }], '03 Oct 2026, 10:00 am IST');
    expect(t).toMatch(/r\.65\(9\)\(b\)/);
    expect(t).toMatch(/Dr Asha Rao, registered with Maharashtra Medical Council under No\. MMC-1234 \(valid till 2027-03-31\)/);
    expect(t).toMatch(/1\. Amoxicillin 500 — 20 unit/);
    expect(t).toMatch(/not for resale/);
  });
  it('an in-app written order must cover every product and quantity; an upload is checked by the pharmacist', () => {
    const items = [{ product_id: 'a', product_name: 'A', quantity: 10 }];
    expect(notCovered(items, [{ product_id: 'a', product_name: 'A', quantity: 10 }])).toEqual([]);
    expect(notCovered(items, [{ product_id: 'a', product_name: 'A', quantity: 11 }])).toEqual(['A']);
    expect(notCovered(items, [{ product_id: 'b', product_name: 'B', quantity: 1 }])).toEqual(['B']);
    expect(notCovered(null, [{ product_id: 'b', product_name: 'B', quantity: 1 }])).toEqual([]);
  });
});
