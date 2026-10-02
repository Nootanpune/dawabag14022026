// Partner onboarding rules (Sprint 28): licences, selling rights, pharmacists,
// invoice prefix and temporary-password strength. Made-up numbers only.
import { passwordProblem } from '../../utils/passwordPolicy';
import { invoicePrefixProblem, pharmacistProblems, sellingRights } from './rules';

const TODAY = '2026-10-02';
const all4 = [
  { form: 'dl21b', valid_upto: '2029-03-31' },
  { form: 'dl20', valid_upto: '2028-12-31' },
  { form: 'dl20b', valid_upto: '2027-06-30' },
  { form: 'dl21', valid_upto: '2028-12-31' },
];

// Licence form / expiry / summary rules: services/licences/forms.test.ts (Sprint 30)
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
    expect(sellingRights([{ form: 'dl20', valid_upto: '2026-01-01' }], TODAY)).toEqual({ retail: false, wholesale: false });
  });
  it('a licence still waiting for Dawabag\'s check gives no right', () => {
    expect(sellingRights([{ form: 'dl20', valid_upto: '2028-01-01', status: 'pending' }], TODAY)).toEqual({ retail: false, wholesale: false });
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
