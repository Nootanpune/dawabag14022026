// Sprint 42 — the sale identity per shipment: channel, the one licence a line is sold under, licences used.
import { channelFor, lineForm, lineLicence, priceFieldWord, registrationSnapshot, usedLicences, SnapLicence } from './rules';

const snap: SnapLicence[] = [
  { form: 'dl20', label: 'Form 20', number: 'R20-OLD', valid_upto: '2026-01-31' },
  { form: 'dl20', label: 'Form 20', number: 'R20-NEW', valid_upto: '2028-03-31' },
  { form: 'dl21', label: 'Form 21', number: 'R21', valid_upto: null },
  { form: 'dl20b', label: 'Form 20B', number: 'W20B', valid_upto: '2027-12-31' },
];

describe('sale identity rules', () => {
  it('channel: trade buyers buy by way of wholesale, everyone else retail', () => {
    expect(channelFor('trade')).toBe('wholesale');
    expect(channelFor('retail')).toBe('retail');
  });
  it('one form per line: Schedule C / C1 → 21 / 21B', () => {
    expect(lineForm('retail', false)).toBe('dl20');
    expect(lineForm('retail', true)).toBe('dl21');
    expect(lineForm('wholesale', false)).toBe('dl20b');
    expect(lineForm('wholesale', true)).toBe('dl21b');
  });
  it('the licence of that form in date today, longest valid first; no date counts as in force', () => {
    expect(lineLicence(snap, 'dl20', '2026-10-03')?.number).toBe('R20-NEW');
    expect(lineLicence(snap, 'dl21', '2026-10-03')?.number).toBe('R21');
    expect(lineLicence(snap, 'dl21b', '2026-10-03')).toBeNull();
    // only a lapsed one held: recorded as it is (allocation would not have chosen this seller)
    expect(lineLicence([snap[0]], 'dl20', '2026-10-03')?.number).toBe('R20-OLD');
  });
  it('licences used, each once, in snapshot order', () => {
    const used = usedLicences(snap, [{ form: 'dl21', number: 'R21' }, { form: 'dl20', number: 'R20-NEW' }, { form: 'dl20', number: 'R20-NEW' }, { form: 'dl21b', number: null }]);
    expect(used.map((l) => l.number)).toEqual(['R20-NEW', 'R21']);
  });
  it('price field word and the registration snapshot', () => {
    expect(priceFieldWord('ptr_price_paise')).toBe('ptr');
    expect(priceFieldWord('institutional_price_paise')).toBe('institutional');
    expect(priceFieldWord('weird')).toBe('offer');
    expect(registrationSnapshot('staff', 'MSPC-1', { state_council: 'MSPC', valid_till: '2027-01-01', status: 'active', verified_at: new Date() }))
      .toEqual({ kind: 'staff', registration_no: 'MSPC-1', state_council: 'MSPC', valid_till: '2027-01-01', status: 'active', verified: true, recorded: 'at_check' });
    expect(registrationSnapshot('partner', 'P-1', undefined).verified).toBe(false);
  });
});
