import { DraftRequest, ExistingProduct, fitsExisting, packKey, planDrafts, requestKey } from './dedupe';

// Made-up items only (no real business data)
let n = 0;
const R = (item_name: string, pack: string | null, manufacturer: string | null, extra: Partial<DraftRequest> = {}): DraftRequest => ({
  id: `r${++n}`, partner_id: 'pa', item_key: `name:${item_name}|${pack}|${manufacturer}`, item_name, pack, manufacturer,
  gst_rate: 5, mrp_paise: 3000, ...extra,
});
const E = (id: string, name: string, net: string | null, extra: Partial<ExistingProduct> = {}): ExistingProduct => ({
  id, name, net_quantity: net, manufacturer_name: 'Zentrix Remedies Pvt Ltd', marketed_by: null, drug_schedule: 'OTC',
  catalogue_state: 'live', ...extra,
});

describe('requestKey (same normalised name + strength + pack + company)', () => {
  it('ignores spelling of the form, case and spacing', () => {
    expect(requestKey(R('ZENTROMOL 650MG TAB', '15 TAB', 'ZEN'))).toBe(requestKey(R('Zentromol 650 mg Tablet', "15's", 'zen')));
  });
  it('a different strength, pack or company is a different item', () => {
    const base = requestKey(R('ZENTROMOL 650MG TAB', '15 TAB', 'ZEN'));
    expect(requestKey(R('ZENTROMOL 500MG TAB', '15 TAB', 'ZEN'))).not.toBe(base);
    expect(requestKey(R('ZENTROMOL 650MG TAB', '10 TAB', 'ZEN'))).not.toBe(base);
    expect(requestKey(R('ZENTROMOL 650MG TAB', '15 TAB', 'QRX'))).not.toBe(base);
  });
  it('packs compare by count and unit', () => {
    expect(packKey('10 TAB')).toBe(packKey("10's"));
    expect(packKey('100 ML')).toBe('100ml');
    expect(packKey('VIAL')).toBe('vial');
  });
});

describe('planDrafts', () => {
  it('groups the same item from two partners into one draft', () => {
    const a = R('ZENTROMOL 650MG TAB', '15 TAB', 'ZEN', { partner_id: 'pa' });
    const b = R('Zentromol 650 mg Tab', "15's", 'zen', { partner_id: 'pb', mrp_paise: 3100 });
    const plan = planDrafts([a, b], []);
    expect(plan).toHaveLength(1);
    expect(plan[0].action).toBe('create');
    expect(plan[0].requests.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  it('keeps different strengths apart (look-alikes are never merged)', () => {
    const plan = planDrafts([R('ZENTROMOL 650MG TAB', '15 TAB', 'ZEN'), R('ZENTROMOL 500MG TAB', '15 TAB', 'ZEN')], []);
    expect(plan.map((g) => g.action)).toEqual(['create', 'create']);
  });

  it('links to the one existing product it clearly is', () => {
    const plan = planDrafts([R('ZENTROMOL 650MG TAB', '15 TAB', 'ZENTRIX')], [E('p1', 'Zentromol 650 mg Tablet', '15 tablets')]);
    expect(plan[0]).toMatchObject({ action: 'existing', product: { id: 'p1' } });
  });

  it('links to an earlier draft (same file text) instead of a duplicate', () => {
    const draft = E('d1', 'ZENTROMOL 650MG TAB', '15 TAB', { manufacturer_name: null, marketed_by: 'ZEN', catalogue_state: 'draft' });
    const plan = planDrafts([R('ZENTROMOL 650MG TAB', '15 TAB', 'ZEN', { partner_id: 'pb' })], [draft]);
    expect(plan[0]).toMatchObject({ action: 'existing', product: { id: 'd1', catalogue_state: 'draft' } });
  });

  it('does not link when the pack or company differs, or the pack is unknown on one side', () => {
    expect(fitsExisting(R('ZENTROMOL 650MG TAB', '10 TAB', 'ZENTRIX'), E('p1', 'Zentromol 650 mg Tablet', '15 tablets'))).toBe(false);
    expect(fitsExisting(R('ZENTROMOL 650MG TAB', '15 TAB', 'QORVEX'), E('p1', 'Zentromol 650 mg Tablet', '15 tablets'))).toBe(false);
    expect(fitsExisting(R('ZENTROMOL 650MG TAB', null, 'ZENTRIX'), E('p1', 'Zentromol 650 mg Tablet', '15 tablets'))).toBe(false);
  });

  it('leaves it for a person when it looks like more than one product', () => {
    const plan = planDrafts([R('ZENTROMOL 650MG TAB', '15 TAB', null)], [
      E('p1', 'Zentromol 650 mg Tablet', '15 tablets'), E('p2', 'Zentromol 650 mg Tablet', '15 tablets', { manufacturer_name: 'Other Labs' }),
    ]);
    expect(plan[0]).toMatchObject({ action: 'skip' });
    expect((plan[0] as any).reason).toMatch(/2 products/);
  });

  it('never links to a Schedule X / NDPS product (C-10)', () => {
    const plan = planDrafts([R('XANTRODEX 10MG TAB', '10 TAB', 'ZENTRIX')],
      [E('x1', 'Xantrodex 10 mg Tablet', '10 tablets', { drug_schedule: 'Schedule X' })]);
    expect(plan[0]).toMatchObject({ action: 'skip' });
    expect((plan[0] as any).reason).toMatch(/C-10/);
  });

  it('needs an MRP from the file to make a draft (nothing guessed)', () => {
    const plan = planDrafts([R('QUORTANIL 5MG TAB', '10 TAB', 'QRX', { mrp_paise: null })], []);
    expect(plan[0]).toMatchObject({ action: 'skip' });
    expect((plan[0] as any).reason).toMatch(/MRP/);
  });

  it('takes the MRP from any request in the group', () => {
    const plan = planDrafts([
      R('QUORTANIL 5MG TAB', '10 TAB', 'QRX', { mrp_paise: null }), R('QUORTANIL 5MG TAB', '10 TAB', 'QRX', { partner_id: 'pb', mrp_paise: 4200 }),
    ], []);
    expect(plan[0]).toMatchObject({ action: 'create', lead: { mrp_paise: 4200 } });
  });
});
