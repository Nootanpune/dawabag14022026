import { detectPreset, headerScore, FIELDS, mappingFromNames, mappingToNames, missingRequired, normHeader, suggestMapping } from './fields';

const field = (k: string) => FIELDS.find((f) => f.key === k)!;
const MEDIVISION = ['Product name', 'Unit', 'Com', 'Shelf', 'Tax%', 'StkIn dt', 'Batch no', 'ExpDt', 'Purc rate', 'PTR', 'MRP', 'Sale rate 1', 'Qty', 'Value'];

describe('partner stock import — column suggestions', () => {
  it('normalises headings', () => {
    expect(normHeader(' Batch No. ')).toBe('batch no');
    expect(normHeader('M.R.P.')).toBe('m r p');
    expect(normHeader('Tax%')).toBe('tax%');
  });

  it('suggests a mapping for a typical Indian billing export', () => {
    const m = suggestMapping(['Item Name', 'Pack', 'Batch No', 'Exp', 'MRP', 'Rate', 'Qty', 'HSN', 'GST%']);
    expect(m).toMatchObject({ item_name: 0, pack: 1, batch_number: 2, expiry: 3, mrp: 4, sale_rate: 5, quantity: 6, hsn: 7, gst_rate: 8,
      manufacturer: null, item_code: null });
    expect(missingRequired(m)).toEqual([]);
  });

  it('understands synonyms (Description, Batch, Expiry Date, Closing Stock, Mfr, Free Qty, Item Code)', () => {
    const m = suggestMapping(['Item Code', 'Description', 'Mfr', 'Batch', 'Expiry Date', 'M.R.P.', 'P.Rate', 'Closing Stock', 'Free Qty']);
    expect(m).toMatchObject({ item_code: 0, item_name: 1, manufacturer: 2, batch_number: 3, expiry: 4, mrp: 5, purchase_rate: 6, quantity: 7, free_quantity: 8 });
  });

  it('never maps totals, values or other dates', () => {
    expect(headerScore('Closing Value', field('quantity'))).toBe(0);
    expect(headerScore('MRP Value', field('mrp'))).toBe(0);
    expect(headerScore('Mfg Date', field('manufacturer'))).toBe(0);
    expect(headerScore('StkIn dt', field('expiry'))).toBe(0);
    expect(headerScore('Exp Date', field('expiry'))).toBe(3);
    const m = suggestMapping(MEDIVISION);
    expect(m.quantity).toBe(12);   // Qty, not Value
  });

  it('reports the required fields left out', () => {
    expect(missingRequired(suggestMapping(['Item Name', 'Qty']))).toEqual(['batch_number', 'expiry', 'mrp']);
  });

  it('recognises MediVision Platinum (Allied Softtech) by its headings or its footer', () => {
    const p = detectPreset(MEDIVISION, []);
    expect(p?.label).toBe('MediVision Platinum (Allied Softtech)');
    const m = mappingFromNames(MEDIVISION, p!.mapping)!;
    expect(m).toMatchObject({ item_name: 0, pack: 1, manufacturer: 2, gst_rate: 4, batch_number: 6, expiry: 7, purchase_rate: 8, ptr: 9,
      mrp: 10, sale_rate: 11, quantity: 12, hsn: null, item_code: null });
    // Shelf, StkIn dt and Value are ignored
    expect(Object.values(m)).not.toContain(3);
    expect(Object.values(m)).not.toContain(5);
    expect(Object.values(m)).not.toContain(13);
    expect(detectPreset(['Item Name', 'Batch', 'Exp', 'MRP', 'Qty'], ['Generated at 2026 by X using Tally'])).toBeNull();
  });

  it('round-trips a saved mapping by heading name', () => {
    const headers = ['Item Name', 'Batch No', 'Exp', 'MRP', 'Qty'];
    const names = mappingToNames(headers, suggestMapping(headers));
    expect(names).toEqual({ item_name: 'item name', batch_number: 'batch no', expiry: 'exp', mrp: 'mrp', quantity: 'qty' });
    // Same headings in another order still map; a missing heading does not
    expect(mappingFromNames(['Qty', 'MRP', 'Exp', 'Batch No', 'Item Name'], names)).toMatchObject({ item_name: 4, quantity: 0 });
    expect(mappingFromNames(['Item Name', 'Batch No', 'MRP', 'Qty'], names)).toBeNull();
  });
});

// Sprint 40: templates/03_Partner_Inventory_Submission.xlsx sheet 4 carries the Sprint 39 supplier columns
describe('partner stock template — supplier columns (Sprint 40, C-02)', () => {
  it('maps supplier_name, supplier_licence_no, supplier_invoice_no and supplier_invoice_date', () => {
    const headers = ['* SKU Code', '* Medicine Name', '* Batch Number', '* Qty Available', '* Expiry Date MM/YYYY', 'Mfg Date MM/YYYY',
      '* Purchase Price per unit Rs', 'supplier_name', 'supplier_invoice_no', 'Date Received DD/MM/YYYY', 'Storage Location Rack',
      'Cold Chain Batch YES NO', 'Remarks', 'supplier_licence_no', 'supplier_invoice_date'];
    const m = suggestMapping(headers);
    expect(m.supplier_name).toBe(7);
    expect(m.supplier_invoice_no).toBe(8);
    expect(m.supplier_licence).toBe(13);
    expect(m.supplier_invoice_date).toBe(14);
    expect(m.batch_number).toBe(2);
  });
});
