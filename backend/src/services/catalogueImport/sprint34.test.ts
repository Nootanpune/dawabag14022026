// Sprint 34 — catalogue import: Schedule C / C1 column and switched-off list entries
import { checkProduct, scheduleCValue } from './validate';
import { switchedOffProblems } from './apply';

const base = {
  _row: 5, sku: 'S34-1', name: 'Insulin Test 40 IU', category: 'Diabetes', drug_schedule: 'Schedule H', mrp: '100', offer_price: '90',
  gst_rate: '5', net_quantity: '10 ml', manufacturer_address: 'Plot 1, Test Area, Pune 411001', hsn_code: '30043110',
};

describe('Schedule C / C1 column', () => {
  it('yes / no words; blank = not given; anything else is an error on the row', () => {
    for (const v of ['yes', 'Y', 'TRUE', '1', 'C1', 'Schedule C']) expect(scheduleCValue(v)).toBe(true);
    for (const v of ['no', 'N', 'false', '0']) expect(scheduleCValue(v)).toBe(false);
    for (const v of ['', null, undefined, '—']) expect(scheduleCValue(v)).toBeUndefined();
    expect(scheduleCValue('maybe')).toBe('invalid');
  });
  it('is carried on the record only when given (an existing product keeps the pharmacist\'s choice)', () => {
    expect(checkProduct({ ...base, schedule_c_c1: 'yes' }).record?.schedule_c_c1).toBe(true);
    expect(checkProduct({ ...base, schedule_c_c1: 'no' }).record?.schedule_c_c1).toBe(false);
    expect('schedule_c_c1' in (checkProduct({ ...base }).record ?? {})).toBe(false);
    expect(checkProduct({ ...base, schedule_c_c1: 'insulin' }).errors).toContain('Schedule C/C1 must be yes or no (or left blank)');
  });
});

describe('switched-off categories and HSN codes', () => {
  const off = { categories: new Map([['old tonics', 'Old Tonics']]), hsn: new Set(['30049011']) };
  it('a new product or a move to a switched-off entry fails with a plain reason', () => {
    expect(switchedOffProblems({ category: 'old  TONICS', hsn_code: null }, null, off)[0])
      .toMatch(/Category "Old Tonics" is switched off in Admin → Catalogue lists/);
    expect(switchedOffProblems({ category: 'Old Tonics', hsn_code: null }, { category: 'Fever' }, off)).toHaveLength(1);
    expect(switchedOffProblems({ category: 'Fever', hsn_code: '30049011' }, { category: 'Fever', hsn_code: '3004' }, off)[0])
      .toMatch(/HSN code 30049011 is switched off/);
  });
  it('a product that already had the entry keeps it', () => {
    expect(switchedOffProblems({ category: 'Old Tonics', hsn_code: '30049011' }, { category: 'old tonics', hsn_code: '30049011' }, off)).toEqual([]);
    expect(switchedOffProblems({ category: 'Fever', hsn_code: '3004' }, null, off)).toEqual([]);
  });
});
