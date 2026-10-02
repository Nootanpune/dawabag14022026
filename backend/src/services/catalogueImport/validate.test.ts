import { checkBatch, checkProduct, toDate } from './validate';
import { toCsv } from '../../utils/csv';

const base = { _row: 7, name: 'Paracetamol 500mg', sku: 'para500', category: 'Pain', drug_schedule: 'otc', mrp: 25, offer_price: 20,
  gst_rate: 12, hsn_code: '30049099', pack_size: '500mg / Strip of 15', marketed_by: 'GSK', manufacturer_address: 'Mumbai 400001' };

describe('catalogue import rows', () => {
  it('converts rupees to paise and normalises SKU and schedule', () => {
    const r = checkProduct(base);
    expect(r.errors).toEqual([]);
    expect(r.record).toMatchObject({ sku: 'PARA500', drug_schedule: 'OTC', mrp_paise: 2500, offer_price_paise: 2000, net_quantity: '500mg / Strip of 15', is_active: true });
  });
  it('rejects prices above MRP (C-16)', () => {
    expect(checkProduct({ ...base, offer_price: 30 }).errors).toContain('Offer price is above MRP');
    expect(checkProduct({ ...base, nppa_ceiling_price: 20 }).errors).toContain('MRP is above the NPPA ceiling price');
  });
  it('imports without a manufacturer address only as inactive (C-17)', () => {
    const r = checkProduct({ ...base, manufacturer_address: '' });
    expect(r.record?.is_active).toBe(false);
  });
  it.each(['Non-scheduled', 'non scheduled', 'NONSCHEDULED', 'NS', 'Non  Scheduled'])('reads "%s" as Non-scheduled (Sprint 31), not OTC', (v) => {
    const r = checkProduct({ ...base, drug_schedule: v });
    expect(r.errors).toEqual([]);
    expect(r.record).toMatchObject({ drug_schedule: 'Non-scheduled', is_active: true });
  });
  it('never lists Schedule X for sale', () => {
    expect(checkProduct({ ...base, drug_schedule: 'Schedule X' }).record?.is_active).toBe(false);
  });
  it('turns MM/YYYY expiry into the month end and refuses expired stock', () => {
    expect(toDate('02/2028', true)).toBe('2028-02-29');
    const today = new Date('2026-10-01');
    expect(checkBatch({ _row: 7, sku: 'X1', batch_number: 'B1', quantity: 10, expiry: '09/2026', purchase_price: 5 }, today).errors.join()).toMatch(/expired/);
    expect(checkBatch({ _row: 7, sku: 'X1', batch_number: 'B1', quantity: 10, expiry: '10/2026', purchase_price: 5 }, today).warnings.join()).toMatch(/30 days/);
  });
});

describe('toCsv', () => {
  it('quotes and neutralises spreadsheet formulas', () => {
    const csv = toCsv(['a', 'b'], [{ a: '=HYPERLINK("x")', b: 'x,y' }, { a: -5, b: null }]);
    expect(csv).toBe(`a,b\n"'=HYPERLINK(""x"")","x,y"\n-5,`);
  });
});
