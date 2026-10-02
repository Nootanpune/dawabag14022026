// Partner onboarding rules (Sprint 28): licences, selling rights, pharmacists,
// invoice prefix and temporary-password strength. Made-up numbers only.
import { passwordProblem } from '../../utils/passwordPolicy';
import { invoicePrefixProblem, LicenceIn, licenceProblems, licenceSummary, pharmacistProblems, sellingRights } from './rules';

const TODAY = '2026-10-02';
const all4: LicenceIn[] = [
  { licence_type: 'dl21b', licence_number: 'TEST-21B-0004', valid_upto: '2029-03-31' },
  { licence_type: 'dl20', licence_number: 'TEST-20-0001', valid_upto: '2028-12-31' },
  { licence_type: 'dl20b', licence_number: 'TEST-20B-0003', valid_upto: '2027-06-30' },
  { licence_type: 'dl21', licence_number: 'TEST-21-0002', valid_upto: '2028-12-31' },
];

describe('licenceProblems', () => {
  it('accepts all four forms in date', () => {
    expect(licenceProblems(all4, TODAY)).toEqual([]);
  });

  it('needs at least one licence', () => {
    expect(licenceProblems([], TODAY)).toEqual(['Enter at least one drug licence (Form 20, 21, 20B or 21B)']);
  });

  it('refuses an expired licence with a plain reason', () => {
    const p = licenceProblems([{ licence_type: 'dl20', licence_number: 'TEST-20-0001', valid_upto: '2026-10-01' }], TODAY);
    expect(p).toEqual(['Form 20 (retail) licence TEST-20-0001 expired on 2026-10-01 — ask the partner for the renewed licence']);
  });

  it('accepts a licence valid until today', () => {
    expect(licenceProblems([{ licence_type: 'dl20', licence_number: 'TEST-20-0001', valid_upto: TODAY }], TODAY)).toEqual([]);
  });

  it('refuses the same form twice, a missing number and an impossible date', () => {
    const p = licenceProblems([
      { licence_type: 'dl20', licence_number: 'TEST-20-0001', valid_upto: '2028-01-01' },
      { licence_type: 'dl20', licence_number: 'X', valid_upto: '2028-02-30' },
    ], TODAY);
    expect(p).toEqual([
      'Form 20 (retail) is entered twice — a partner holds one licence of each form',
      'Form 20 (retail): enter the licence number',
      'Form 20 (retail): enter the valid-till date',
    ]);
  });
});

describe('licenceSummary', () => {
  it('uses Form 20 as the licence number and the earliest valid-till date', () => {
    expect(licenceSummary(all4)).toEqual({ drug_license_no: 'TEST-20-0001', drug_license_type: 'dl20', drug_license_expiry: '2027-06-30' });
  });

  it('falls back to the wholesale licence for a wholesale-only partner', () => {
    expect(licenceSummary(all4.filter((l) => l.licence_type.endsWith('b')))).toMatchObject({ drug_license_type: 'dl20b' });
  });
});

describe('sellingRights', () => {
  it('retail and wholesale with all four forms', () => {
    expect(sellingRights(all4, TODAY)).toEqual({ retail: true, wholesale: true });
  });
  it('retail only with Form 20 / 21', () => {
    expect(sellingRights(all4.slice(1, 2), TODAY)).toEqual({ retail: true, wholesale: false });
  });
  it('wholesale only with Form 20B / 21B', () => {
    expect(sellingRights([all4[0], all4[2]], TODAY)).toEqual({ retail: false, wholesale: true });
  });
  it('an expired licence gives no right', () => {
    expect(sellingRights([{ licence_type: 'dl20', valid_upto: '2026-01-01' }], TODAY)).toEqual({ retail: false, wholesale: false });
  });
});

describe('pharmacistProblems', () => {
  it('accepts two registered pharmacists', () => {
    expect(pharmacistProblems([
      { full_name: 'Test Pharmacist One', registration_no: 'TEST-MSPC-001' },
      { full_name: 'Test Pharmacist Two', registration_no: 'TEST-MSPC-002' },
    ])).toEqual([]);
  });
  it('needs at least one, with name and registration number, not repeated', () => {
    expect(pharmacistProblems([])).toEqual(['Enter at least one registered pharmacist']);
    expect(pharmacistProblems([
      { full_name: 'A', registration_no: '' },
      { full_name: 'Test One', registration_no: 'msPC-1' },
      { full_name: 'Test Two', registration_no: 'MSPC-1' },
    ])).toEqual([
      'Pharmacist 1: enter the full name',
      'Pharmacist 1: enter the State Pharmacy Council registration number',
      'Pharmacist registration MSPC-1 is entered twice',
    ]);
  });
});

describe('invoicePrefixProblem', () => {
  it.each(['NP', 'NPP1', 'A2'])('accepts %s', (p) => expect(invoicePrefixProblem(p)).toBeNull());
  it.each(['N', 'NPPPP', '0NP', 'np', 'N-P'])('refuses %s', (p) => expect(invoicePrefixProblem(p)).toMatch(/2–4 capital letters/));
  it('keeps Dawabag\'s own prefixes', () => expect(invoicePrefixProblem('DWB')).toBe('DWB is reserved for Dawabag'));
});

describe('passwordProblem (temporary and new passwords)', () => {
  it('accepts 8+ characters with a letter and a number', () => {
    expect(passwordProblem('Temp-2026-pass', '9000002801')).toBeNull();
  });
  it.each([
    ['short1', /at least 8 characters/],
    ['onlyletters', /one letter and one number/],
    ['1234567890', /one letter and one number/],
    [' Leading1x', /start or end with a space/],
    ['pw9000002801', /mobile number/],
  ])('refuses %s', (pw, msg) => {
    expect(passwordProblem(pw, '9000002801')).toMatch(msg);
  });
  it('refuses more than bcrypt can read', () => {
    expect(passwordProblem('a1'.repeat(40))).toMatch(/at most 72/);
  });
});
