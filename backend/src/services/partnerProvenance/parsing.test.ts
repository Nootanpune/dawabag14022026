// Sprint 39: the stock file's and the live feed's optional supplier columns
import { suggestMapping } from '../partnerStockImport/fields';
import { prepareRows } from '../partnerStockImport/rows';
import { snapshotSha256, snapshotToImport } from '../partnerLiveFeed/snapshot';

describe('provenance columns in stock files and the live feed', () => {
  const headers = ['Item Name', 'Batch No', 'Expiry', 'MRP', 'Qty', 'Supplier', 'Supplier DL No', 'Bill No', 'Bill Date'];
  it('recognises the usual headings', () => {
    const m = suggestMapping(headers);
    expect([m.supplier_name, m.supplier_licence, m.supplier_invoice_no, m.supplier_invoice_date]).toEqual([5, 6, 7, 8]);
    expect(m.expiry).toBe(2);
  });
  it('a stock line carries them; an unreadable date is a warning, not a problem', () => {
    const m = suggestMapping(headers);
    const [ok, bad] = prepareRows([
      { rowNumber: 2, cells: ['PARA 500', 'B1', '12/2027', '30', '10', 'Lake Distributors', 'mh-20b-9', 'L/77', '01/09/2026'] },
      { rowNumber: 3, cells: ['PARA 500', 'B2', '12/2027', '30', '10', '', '', '', 'soon'] },
    ], m);
    expect(ok.parsed).toMatchObject({ supplier_name: 'Lake Distributors', supplier_licence_no: 'MH-20B-9', supplier_invoice_no: 'L/77', supplier_invoice_date: '2026-09-01' });
    expect(ok.problems).toEqual([]);
    expect(bad.problems).toEqual([]);
    expect(bad.warnings.join()).toMatch(/not a date/);
    expect(bad.parsed.supplier_invoice_date ?? null).toBeNull();
  });
  it('the feed JSON maps them, and a snapshot without them keeps its earlier fingerprint', () => {
    const item = { item_name: 'PARA 500', batch: 'B1', expiry: '12/2027', mrp: 30, quantity: 10 };
    const imp = snapshotToImport({ sequence: 1, taken_at: '2026-10-03T10:00:00+05:30', complete: true,
      items: [{ ...item, supplier_name: 'Lake Distributors', supplier_invoice_no: 'L/77' }] } as any, 100);
    const rows = prepareRows(imp.rows, imp.mapping);
    expect(rows[0].parsed).toMatchObject({ supplier_name: 'Lake Distributors', supplier_invoice_no: 'L/77' });
    // fingerprint without provenance = the Sprint 37 fingerprint (14 base columns only)
    const legacy = require('crypto').createHash('sha256').update(JSON.stringify([[null, 'PARA 500', null, null, null, 'B1', '12/2027', 30, null, null, null, 10, null, null]])).digest('hex');
    expect(snapshotSha256([item as any])).toBe(legacy);
  });
});
