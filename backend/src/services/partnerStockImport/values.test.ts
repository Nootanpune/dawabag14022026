import { daysBetween, excelSerialToIso, parseExpiry, parsePercent, parseQuantity, parseRupeesToPaise } from './values';

describe('partner stock import — expiry dates', () => {
  it.each([
    ['2027-11-01', '2027-11-01'],          // Excel date cell (MediVision ExpDt)
    ['2027-11-01T00:00:00.000Z', '2027-11-01'],
    ['15/08/2027', '2027-08-15'],          // DD/MM/YYYY, day first (India)
    ['15-08-27', '2027-08-15'],
    ['05.03.2028', '2028-03-05'],
    ['12/27', '2027-12-31'],               // MM/YY → end of month
    ['02/28', '2028-02-29'],               // leap year
    ['2/2029', '2029-02-28'],              // M/YYYY
    ['11-2027', '2027-11-30'],
    ['2027/06', '2027-06-30'],
    ['Dec-27', '2027-12-31'],
    ['NOV 2027', '2027-11-30'],
    ['Sept/28', '2028-09-30'],
    ['01-Nov-2027', '2027-11-01'],
    ['46692', '2027-11-01'],               // Excel serial number
  ])('%s → %s', (raw, want) => expect(parseExpiry(raw)).toBe(want));

  it.each(['', '13/27', '31/02/2027', 'soon', '00/27', '1234', 'Foo-27'])('"%s" is not a date', (raw) => expect(parseExpiry(raw)).toBeNull());

  it('converts Excel serials in a sane range only', () => {
    expect(excelSerialToIso(45658)).toBe('2025-01-01');
    expect(excelSerialToIso(12)).toBeNull();
  });

  it('counts days', () => expect(daysBetween('2026-10-02', '2026-11-01')).toBe(30));
});

describe('partner stock import — quantities and amounts', () => {
  it('reads packs', () => {
    expect(parseQuantity('12')).toEqual({ value: 12 });
    expect(parseQuantity('1,200')).toEqual({ value: 1200 });
    expect(parseQuantity('10+2')).toEqual({ value: 12 });      // billed + free
    expect(parseQuantity('')).toEqual({ value: null });
    expect(parseQuantity('2.5').value).toBe(2);
    expect(parseQuantity('2.5').note).toMatch(/Loose units/);
    expect(parseQuantity('-3').error).toBe('Quantity is negative');
    expect(parseQuantity('ten').error).toMatch(/not a number/);
  });

  it('reads rupees as paise', () => {
    expect(parseRupeesToPaise('      40.00')).toBe(4000);     // MediVision "Sale rate 1" is text
    expect(parseRupeesToPaise('₹ 1,234.50')).toBe(123450);
    expect(parseRupeesToPaise('Rs.40')).toBe(4000);
    expect(parseRupeesToPaise(21.43)).toBe(2143);
    expect(parseRupeesToPaise('')).toBeNull();
    expect(parseRupeesToPaise('Totals:')).toBeNaN();
  });

  it('reads GST %', () => {
    expect(parsePercent('12%')).toBe(12);
    expect(parsePercent('GST 5')).toBe(5);
    expect(parsePercent('18.00')).toBe(18);
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('exempt')).toBeNaN();
  });
});
