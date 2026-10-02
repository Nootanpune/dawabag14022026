// Drug licence rules for every party (Sprint 30): forms as people write them, the
// migration mapping of older single-licence values, validation, the derived summary,
// rights and eligibility with several licences, one of them expired. Made-up numbers only.
import {
  eligibility, formLabel, licenceLine, licenceProblems, licenceRights, licenceSummary, normaliseForm, numberKey, validity,
} from './forms';

const TODAY = '2026-10-02';
const partner4 = [
  { form: 'dl21b' as const, licence_number: 'TEST-21B-0004', valid_upto: '2029-03-31' },
  { form: 'dl20' as const, licence_number: 'TEST-20-0001', valid_upto: '2028-12-31' },
  { form: 'dl20b' as const, licence_number: 'TEST-20B-0003', valid_upto: '2027-06-30' },
  { form: 'dl21' as const, licence_number: 'TEST-21-0002', valid_upto: '2028-12-31' },
];

describe('normaliseForm (forms as printed, and older stored values)', () => {
  it.each([
    ['20', 'dl20'], ['21B', 'dl21b'], ['Form 20B', 'dl20b'], ['form 21-b', 'dl21b'], ['dl20', 'dl20'],
    ['DL-20', 'dl20'], ['DL-21B', 'dl21b'], ['25', 'dl25'], ['Form 28A', 'dl28a'], ['25 B', 'dl25b'], ['20F', 'dl20f'],
    ['retail_20', 'dl20'], ['wholesale_21b', 'dl21b'], ['restricted_20a', 'dl20a'], ['schedule_x_20g', 'dl20g'], ['other', 'other'],
  ])('%s → %s', (input, code) => expect(normaliseForm(input)).toBe(code));
  it.each(['21C', '30', 'none', '', 'gst', 42, null])('%s is not a form we know', (input) => expect(normaliseForm(input as any)).toBeNull());
});

describe('labels and numbers', () => {
  it('labels forms and uses the typed name for other forms', () => {
    expect(formLabel('dl20b')).toBe('Form 20B');
    expect(formLabel('other', 'State hospital pharmacy licence')).toBe('State hospital pharmacy licence');
  });
  it('treats a number typed with spaces, dashes or slashes as the same number', () => {
    expect(numberKey('mh-pz1/20-123 45')).toBe(numberKey('MH PZ1 20 12345'));
  });
  it('prints every licence on one line, retail first', () => {
    expect(licenceLine(partner4)).toBe('Form 20: TEST-20-0001 · Form 21: TEST-21-0002 · Form 20B: TEST-20B-0003 · Form 21B: TEST-21B-0004');
    expect(licenceLine([])).toBeNull();
  });
});

describe('licenceProblems', () => {
  const opts = (party: any, extra = {}) => ({ party, today: TODAY, requireValidUpto: true, ...extra });
  it('accepts a partner with all four licences', () => expect(licenceProblems(partner4, opts('partner'))).toEqual([]));
  it('accepts a supplier with Form 25 + 20B', () => {
    expect(licenceProblems([
      { form: 'dl25', licence_number: 'TEST-25-0001', valid_upto: '2028-01-01' },
      { form: 'dl20b', licence_number: 'TEST-20B-0009', valid_upto: '2028-01-01' },
    ], opts('supplier'))).toEqual([]);
  });
  it('refuses a supplier with a retail licence only', () => {
    expect(licenceProblems([{ form: 'dl20', licence_number: 'TEST-20-0002', valid_upto: '2028-01-01' }], opts('supplier')))
      .toEqual(['A supplier needs a wholesale (Form 20B / 21B) or manufacturing (Form 25 / 28) drug licence']);
  });
  it('a retailer needs Form 20 or 21; a wholesaler 20B or 21B', () => {
    expect(licenceProblems([{ form: 'dl20b', licence_number: 'TEST-20B-1', valid_upto: '2028-01-01' }], opts('retailer')))
      .toEqual(['A retail pharmacy account needs a retail drug licence (Form 20 or 21)']);
    expect(licenceProblems([{ form: 'dl20', licence_number: 'TEST-20-1', valid_upto: '2028-01-01' },
      { form: 'dl21', licence_number: 'TEST-21-1', valid_upto: '2028-01-01' }], opts('wholesaler')))
      .toEqual(['A wholesale account needs a wholesale drug licence (Form 20B or 21B)']);
  });
  it('a buyer at sign-up may leave the valid-till date for the admin', () => {
    expect(licenceProblems([{ form: 'dl20', licence_number: 'TEST-20-1' }, { form: 'dl21', licence_number: 'TEST-21-1' }],
      opts('retailer', { requireValidUpto: false }))).toEqual([]);
  });
  it('a doctor needs no licence but may add one', () => {
    expect(licenceProblems([], opts('doctor'))).toEqual([]);
    expect(licenceProblems([{ form: 'other', form_name: 'Hospital pharmacy licence', licence_number: 'TEST-HP-1', valid_upto: '2028-01-01' }],
      opts('doctor'))).toEqual([]);
  });
  it('needs at least one licence for a partner, with the reason', () => {
    expect(licenceProblems([], opts('partner'))[0]).toMatch(/^Enter at least one drug licence\. A partner pharmacy needs/);
  });
  it('refuses an expired licence with the date, and a renewal must be in date too', () => {
    expect(licenceProblems([{ form: 'dl20', licence_number: 'TEST-20-0001', valid_upto: '2026-10-01' }], opts('partner')))
      .toEqual(['Form 20 licence TEST-20-0001 expired on 2026-10-01 — enter the renewed licence']);
    expect(licenceProblems([{ form: 'dl21', licence_number: 'TEST-21-0002', valid_upto: '2026-01-01' }], opts('partner', { partial: true })))
      .toEqual(['Form 21 licence TEST-21-0002 expired on 2026-01-01 — enter the renewed licence']);
  });
  it('accepts a licence valid until today', () => {
    expect(licenceProblems([{ form: 'dl20', licence_number: 'TEST-20-0001', valid_upto: TODAY }], opts('partner'))).toEqual([]);
  });
  it('refuses the same form twice, a missing number, an impossible date and an unnamed other form', () => {
    expect(licenceProblems([
      { form: 'dl20', licence_number: 'TEST-20-0001', valid_upto: '2028-01-01' },
      { form: 'dl20', licence_number: 'X', valid_upto: '2028-02-30' },
      { form: 'other', form_name: '', licence_number: 'TEST-O-1', valid_upto: '2028-01-01' },
    ], opts('partner'))).toEqual([
      'Form 20 is entered twice — enter each licence form once',
      'Form 20: enter the licence number',
      'Form 20: enter the valid-till date as a real date',
      'Licence 3: type the name of the licence form',
    ]);
  });
  it('allows the same number on two forms of one party (one number for 20 and 21)', () => {
    expect(licenceProblems([{ form: 'dl20', licence_number: 'TEST-2021-1', valid_upto: '2028-01-01' },
      { form: 'dl21', licence_number: 'TEST-2021-1', valid_upto: '2028-01-01' }], opts('retailer'))).toEqual([]);
  });
  it('checks valid-from', () => {
    expect(licenceProblems([{ form: 'dl20', licence_number: 'TEST-20-1', valid_from: '2029-01-01', valid_upto: '2028-01-01' }], opts('retailer')))
      .toEqual(['Form 20: valid-from is after valid-till']);
  });
});

describe('licenceSummary (the single licence every older check reads)', () => {
  it('Form 20 number and the EARLIEST valid-till of all four', () => {
    expect(licenceSummary(partner4)).toEqual({ number: 'TEST-20-0001', form: 'dl20', expiry: '2027-06-30' });
  });
  it('wholesale-only partner: Form 20B', () => {
    expect(licenceSummary(partner4.filter((l) => l.form.endsWith('b')))).toMatchObject({ form: 'dl20b' });
  });
  it('manufacturer + wholesaler: wholesale number first', () => {
    expect(licenceSummary([{ form: 'dl25', licence_number: 'M-25', valid_upto: '2027-01-01' },
      { form: 'dl20b', licence_number: 'W-20B', valid_upto: '2029-01-01' }])).toEqual({ number: 'W-20B', form: 'dl20b', expiry: '2027-01-01' });
  });
  it('ignores licences still waiting for the check', () => {
    expect(licenceSummary([{ form: 'dl20', licence_number: 'P', valid_upto: '2030-01-01', status: 'pending' }])).toBeNull();
    expect(licenceSummary([{ form: 'dl21', licence_number: 'V', valid_upto: '2027-01-01', status: 'verified' },
      { form: 'dl20', licence_number: 'P', valid_upto: '2026-11-01', status: 'pending' }])).toEqual({ number: 'V', form: 'dl21', expiry: '2027-01-01' });
  });
});

describe('validity', () => {
  it.each([[null, 'no_date'], ['2026-10-01', 'expired'], [TODAY, 'expiring'], ['2026-11-01', 'expiring'], ['2026-11-02', 'valid']])(
    '%s → %s', (d, v) => expect(validity(d as any, TODAY)).toBe(v));
});

describe('eligibility with several licences', () => {
  it('partner with four licences in date may sell; warnings for ≤ 30 days', () => {
    const e = eligibility([...partner4, { form: 'dl20f', licence_number: 'TEST-20F-1', valid_upto: '2026-10-20' }], 'partner', TODAY);
    expect(e).toMatchObject({ ok: true, reasons: [], expired: [], missingKind: false });
    expect(e.warnings).toEqual(['Form 20F licence TEST-20F-1 expires on 2026-10-20']);
  });
  it('one of four expired → blocked, naming that licence', () => {
    const e = eligibility(partner4.map((l) => (l.form === 'dl21b' ? { ...l, valid_upto: '2026-09-30' } : l)), 'partner', TODAY);
    expect(e.ok).toBe(false);
    expect(e.expired).toEqual(['Form 21B licence TEST-21B-0004 expired on 2026-09-30']);
  });
  it('a pending renewal does not unblock until it is checked', () => {
    const e = eligibility([{ form: 'dl20', licence_number: 'OLD', valid_upto: '2026-09-01', status: 'verified' },
      { form: 'dl20', licence_number: 'NEW', valid_upto: '2031-09-01', status: 'pending' }], 'retailer', TODAY);
    expect(e.ok).toBe(false);
    expect(e.expired).toHaveLength(1);
  });
  it('retailer with 20 + 21 in date may buy; wholesaler with only retail licences may not', () => {
    const retail = [{ form: 'dl20', licence_number: 'R20', valid_upto: '2028-01-01' }, { form: 'dl21', licence_number: 'R21', valid_upto: '2028-01-01' }];
    expect(eligibility(retail, 'retailer', TODAY).ok).toBe(true);
    const w = eligibility(retail, 'wholesaler', TODAY);
    expect(w).toMatchObject({ ok: false, missingKind: true, expired: [] });
  });
  it('supplier with Form 25 only is fine; with 20 only it lacks the kind (a warning at receipt)', () => {
    expect(eligibility([{ form: 'dl25', licence_number: 'M', valid_upto: '2028-01-01' }], 'supplier', TODAY).ok).toBe(true);
    expect(eligibility([{ form: 'dl20', licence_number: 'R', valid_upto: '2028-01-01' }], 'supplier', TODAY).missingKind).toBe(true);
  });
  it('rights come from checked, in-date licences only', () => {
    expect(licenceRights(partner4, TODAY)).toEqual({ retail: true, wholesale: true, manufacture: false });
    expect(licenceRights([{ form: 'dl25', valid_upto: '2028-01-01' }, { form: 'dl20b', valid_upto: '2026-01-01' }], TODAY))
      .toEqual({ retail: false, wholesale: false, manufacture: true });
  });
});
