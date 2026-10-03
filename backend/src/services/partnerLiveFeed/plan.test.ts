import type { ParsedRow } from '../partnerStockImport/rows';
import { LedgerBatch, Listing, planSnapshot, PlanRow } from './plan';

// Made-up products, batches and quantities
const parsed = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  item_code: null, item_name: 'S37 ITEM', pack: '10 TAB', manufacturer: 'S37R', hsn: null, batch_number: 'B1', expiry_raw: '05/28',
  expiry_date: '2028-05-31', mrp_paise: 3000, ptr_paise: null, sale_rate_paise: 2600, purchase_rate_paise: 1800,
  quantity: 10, free_quantity: null, total_quantity: 10, gst_rate: 12, filled_down: false, ...over,
});
const row = (over: Partial<PlanRow> = {}, p: Partial<ParsedRow> = {}): PlanRow => ({
  status: 'matched', product_id: 'prod-a', item_key: 'code:A', match_method: 'item_link', parsed: parsed(p), problems: [], warnings: [], ...over,
});
const listingA: Listing = { ppId: 'pp-a', productId: 'prod-a', name: 'S37 Alpha', coldChain: false };
const listingCold: Listing = { ppId: 'pp-c', productId: 'prod-c', name: 'S37 Coldin', coldChain: true };
const batch = (over: Partial<LedgerBatch> = {}): LedgerBatch => ({
  id: 'inv-1', ppId: 'pp-a', productId: 'prod-a', batch_number: 'B1', qty_available: 50, qty_reserved: 0, expiry_date: '2028-05-31',
  mrp_paise: 3000, sale_rate_paise: 2600, ...over,
});
const input = (rows: PlanRow[], ledger: LedgerBatch[] = [batch()], extra: Partial<Parameters<typeof planSnapshot>[0]> = {}) => ({
  rows, listings: new Map([['prod-a', listingA], ['prod-c', listingCold]]), ledger, dispatchedSince: new Map<string, number>(),
  dismissed: new Set<string>(), ...extra,
});

describe('live snapshot plan (Sprint 37)', () => {
  it('applies the quantity of a linked, listed batch automatically', () => {
    const plan = planSnapshot(input([row({}, { total_quantity: 37 })]));
    expect(plan.writes).toEqual([expect.objectContaining({ inventoryId: 'inv-1', qty_available: 37, feed_quantity: 37 })]);
    expect(plan.checks).toEqual([]);
    expect(plan.zero).toEqual([]);
  });

  it('holds back units reserved for undispatched orders and subtracts units dispatched after the snapshot', () => {
    const plan = planSnapshot(input([row({}, { total_quantity: 20 })], [batch({ qty_reserved: 3 })], { dispatchedSince: new Map([['inv-1', 2]]) }));
    // shelf = 20 − 2 dispatched after T = 18; sellable on Dawabag = 18 − 3 reserved = 15
    expect(plan.writes[0].qty_available).toBe(18);
    expect(plan.held_for_orders).toBe(3);
    expect(plan.dispatched_after_snapshot).toBe(2);
  });

  it('never goes below what orders hold, and raises the shortfall', () => {
    const plan = planSnapshot(input([row({}, { total_quantity: 2 })], [batch({ qty_reserved: 5 })]));
    expect(plan.writes[0].qty_available).toBe(5);
    expect(plan.checks).toEqual([expect.objectContaining({ kind: 'short_for_orders', details: expect.objectContaining({ reserved: 5, in_software: 2 }) })]);
  });

  it('full snapshot: a ledger batch absent from the snapshot goes to 0 sellable', () => {
    const plan = planSnapshot(input([row()], [batch(), batch({ id: 'inv-2', batch_number: 'OLD9' })]));
    expect(plan.zero).toEqual(['inv-2']);
  });

  it('a batch on a line with a problem (expired, short-dated) sells nothing', () => {
    const plan = planSnapshot(input([row({ status: 'problem', problems: ['Expired'] })]));
    expect(plan.writes).toEqual([]);
    expect(plan.zero).toEqual(['inv-1']);
  });

  it('a new batch with a valid expiry of a listed product applies automatically', () => {
    const plan = planSnapshot(input([row({}, { batch_number: 'NEW2', total_quantity: 8 })], []));
    expect(plan.writes).toEqual([expect.objectContaining({ inventoryId: null, batch_number: 'NEW2', qty_available: 8, mrp_paise: 3000 })]);
  });

  it('a new batch of a refrigerated product waits for the cold-storage declaration', () => {
    const plan = planSnapshot(input([row({ product_id: 'prod-c', item_key: 'code:C' }, { batch_number: 'C1' })], []));
    expect(plan.writes).toEqual([]);
    expect(plan.checks).toEqual([expect.objectContaining({ kind: 'cold_chain_batch', batch_key: 'C1' })]);
  });

  it('a different MRP or rate waits for a person; the quantity still applies with the old price kept', () => {
    const plan = planSnapshot(input([row({}, { mrp_paise: 3200, total_quantity: 9 })]));
    expect(plan.writes[0]).toMatchObject({ qty_available: 9, mrp_paise: 3000 });
    expect(plan.checks).toEqual([expect.objectContaining({ kind: 'price_change', details: expect.objectContaining({ mrp: { from: 3000, to: 3200 } }) })]);
  });

  it('the first price seen for a batch is adopted, not raised', () => {
    const plan = planSnapshot(input([row({}, { mrp_paise: 3300 })], [batch({ mrp_paise: null, sale_rate_paise: null })]));
    expect(plan.checks).toEqual([]);
    expect(plan.writes[0]).toMatchObject({ mrp_paise: 3300, sale_rate_paise: 2600 });
  });

  it('an earlier expiry is adopted; a later one waits for a person', () => {
    let plan = planSnapshot(input([row({}, { expiry_date: '2028-02-29' })]));
    expect(plan.writes[0].expiry_date).toBe('2028-02-29');
    expect(plan.checks).toEqual([]);
    plan = planSnapshot(input([row({}, { expiry_date: '2029-01-31' })]));
    expect(plan.writes[0].expiry_date).toBe('2028-05-31');
    expect(plan.checks).toEqual([expect.objectContaining({ kind: 'expiry_change', details: expect.objectContaining({ to: '2029-01-31' }) })]);
  });

  it('a linked product the partner does not list yet waits for its listing declarations', () => {
    const plan = planSnapshot(input([row({ product_id: 'prod-x', item_key: 'code:X' })], []));
    expect(plan.checks).toEqual([expect.objectContaining({ kind: 'new_listing', item_key: 'code:X', product_id: 'prod-x' })]);
  });

  it('an unknown item waits as a new product, once per item, unless set aside', () => {
    const unknown = (b: string) => row({ status: 'needs_review', product_id: null, item_key: 'name:s37 new|10 tab|' }, { batch_number: b });
    let plan = planSnapshot(input([unknown('N1'), unknown('N2')], []));
    expect(plan.checks).toEqual([expect.objectContaining({ kind: 'new_product', details: expect.objectContaining({ quantity: 20, batches: 2 }) })]);
    plan = planSnapshot(input([unknown('N1')], [], { dismissed: new Set(['name:s37 new|10 tab|']) }));
    expect(plan.checks).toEqual([]);
  });

  it('same batch on two lines: quantities added, earliest expiry kept', () => {
    const plan = planSnapshot(input([row({}, { total_quantity: 4 }), row({}, { total_quantity: 6, expiry_date: '2028-05-01' })]));
    expect(plan.writes[0]).toMatchObject({ qty_available: 10 });
  });

  it('remembers exact catalogue matches as links', () => {
    const plan = planSnapshot(input([row({ match_method: 'catalogue', item_key: 'name:alpha' })]));
    expect(plan.learnt_links).toEqual([{ item_key: 'name:alpha', product_id: 'prod-a', label: 'S37 ITEM' }]);
  });
});
