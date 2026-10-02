import type { CatalogueProduct } from './match';
import type { ParsedRow } from './rows';
import { checkAgainstProduct, checkLine, duplicateBatchChecks } from './validate';

const TODAY = '2026-10-02';
const c = { today: TODAY, minShelfDays: 30 };
const line = (o: Partial<ParsedRow> = {}): ParsedRow => ({
  item_code: null, item_name: 'ALPHAMOL 500 TAB', pack: '10 TAB', manufacturer: null, hsn: null, batch_number: 'B1',
  expiry_raw: '2028-01-01', expiry_date: '2028-01-01', mrp_paise: 3000, ptr_paise: 2100, sale_rate_paise: 2600,
  purchase_rate_paise: 1800, quantity: 10, free_quantity: null, total_quantity: 10, gst_rate: 5, filled_down: false, ...o,
});
const product = (o: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id: 'p', name: 'Alphamol 500 mg Tablet', generic_name: null, net_quantity: '10 tablets', drug_schedule: 'OTC', manufacturer_name: null,
  marketed_by: null, mrp_paise: 3000, offer_price_paise: 2600, hsn_code: '30049099', gst_rate: 5, cold_chain: false, ...o,
});

describe('partner stock import — line checks', () => {
  it('passes a complete line', () => expect(checkLine(line(), c)).toEqual({ problems: [], warnings: [] }));

  it('needs batch, expiry, quantity and MRP', () => {
    const r = checkLine(line({ batch_number: null, expiry_raw: null, expiry_date: null, quantity: null, mrp_paise: null }), c);
    expect(r.problems).toEqual(['Batch number is missing', 'Expiry date is missing', 'Quantity is missing', 'MRP is missing']);
    expect(checkLine(line({ expiry_raw: 'soon', expiry_date: null }), c).problems[0]).toMatch(/not a date we can read/);
    expect(checkLine(line({ mrp_paise: 0 }), c).problems).toContain('MRP must be more than zero');
  });

  it('refuses expired and short-dated stock (C-27)', () => {
    expect(checkLine(line({ expiry_date: '2026-09-30' }), c).problems).toEqual(['Expired on 30 Sep 2026']);
    expect(checkLine(line({ expiry_date: '2026-11-01' }), c).problems[0]).toMatch(/within 30 days.*C-27/);
    expect(checkLine(line({ expiry_date: '2026-11-02' }), c).problems).toEqual([]);
  });

  it('refuses a selling rate or PTR above MRP (C-16); warns on purchase rate', () => {
    expect(checkLine(line({ sale_rate_paise: 3100 }), c).problems[0]).toMatch(/Selling rate ₹31.00 is above the MRP ₹30.00 \(C-16\)/);
    expect(checkLine(line({ ptr_paise: 3500 }), c).problems[0]).toMatch(/PTR/);
    expect(checkLine(line({ purchase_rate_paise: 3500 }), c).warnings[0]).toMatch(/Purchase rate/);
  });
});

describe('partner stock import — checks against the Dawabag product', () => {
  it('never lists Schedule X or NDPS (C-10)', () => {
    expect(checkAgainstProduct(line(), product({ drug_schedule: 'Schedule X' }), { ...c, listed: true }).problems[0]).toMatch(/never be sold online \(C-10\)/);
    expect(checkAgainstProduct(line(), product({ drug_schedule: 'NDPS' }), { ...c, listed: true }).problems).toHaveLength(1);
  });

  it('refuses a batch printed below Dawabag\'s selling price (C-16)', () => {
    const r = checkAgainstProduct(line({ mrp_paise: 2500 }), product(), { ...c, listed: true });
    expect(r.problems[0]).toMatch(/below Dawabag's selling price ₹26.00/);
  });

  it('warns on differences, reservations, cold chain, new and H1 listings', () => {
    const r = checkAgainstProduct(line({ mrp_paise: 3200, gst_rate: 12, hsn: '30041010', total_quantity: 2 }),
      product({ cold_chain: true }), { ...c, reserved: 5, listed: false });
    expect(r.problems).toEqual([]);
    expect(r.warnings.join(' | ')).toMatch(/MRP differs.*GST 12%.*HSN 30041010.*5 packs are reserved.*Refrigerated.*New listing/);
    expect(checkAgainstProduct(line(), product({ drug_schedule: 'Schedule H1' }), { ...c, listed: false }).warnings[0]).toMatch(/pharmacist/);
  });

  it('reports recalled batches (C-28)', () => {
    expect(checkAgainstProduct(line(), product(), { ...c, listed: true, recalled: 'Batch B1 is recalled' }).problems).toEqual(['Batch B1 is recalled']);
  });
});

describe('partner stock import — duplicate batches', () => {
  it('adds up the same batch, flags different expiries', () => {
    const r = duplicateBatchChecks([
      { key: 'p|B1', rowNumber: 3, expiry: '2028-01-01' },
      { key: 'p|B1', rowNumber: 7, expiry: '2028-01-01' },
      { key: 'p|B2', rowNumber: 8, expiry: '2028-01-01' },
      { key: 'p|B2', rowNumber: 9, expiry: '2029-01-01' },
      { key: 'p|B3', rowNumber: 10, expiry: '2029-01-01' },
      { key: 'p|B4', rowNumber: 11, expiry: '2027-05-01' },
      { key: 'p|B4', rowNumber: 12, expiry: '2027-05-31' },
    ]);
    expect(r.get(3)?.warning).toMatch(/row 7: quantities are added/);
    expect(r.get(9)?.problem).toMatch(/different expiry/);
    expect(r.has(10)).toBe(false);
    expect(r.get(12)?.warning).toMatch(/added together/);   // same month written two ways
    expect(r.get(12)?.problem).toBeUndefined();
  });
});
