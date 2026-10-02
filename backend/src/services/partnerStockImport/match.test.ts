import { buildMatchContext, CatalogueProduct, matchRow, RowIdentity } from './match';
import { itemKey, makersAgree, nameTokens, packsAgree, parsePack } from './normalise';

const P = (id: string, name: string, net: string | null, extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id, name, generic_name: null, net_quantity: net, drug_schedule: 'OTC', manufacturer_name: 'Demo Pharma Pvt Ltd', marketed_by: null,
  mrp_paise: 3000, offer_price_paise: 2600, hsn_code: '30049099', gst_rate: 5, cold_chain: false, ...extra,
});
const CATALOGUE = [
  P('pcm500', 'Paracetamol 500 mg Tablet', '15 tablets'),
  P('pcm650', 'Paracetamol 650 mg Tablet', '15 tablets'),
  P('ctz10', 'Cetirizine 10 mg Tablet', '10 tablets'),
  P('lcz5', 'Levocetirizine 5 mg Tablet', '10 tablets'),
  P('amx', 'Amoxicillin 500 mg Capsule', '10 capsules', { manufacturer_name: 'Alpha Labs' }),
  P('amx2', 'Amoxicillin 500 mg Capsule', '10 capsules', { manufacturer_name: 'Beta Remedies' }),
  P('syr', 'Paracetamol 250 mg/5 ml Oral Suspension', '60 ml'),
];
const row = (item_name: string, pack: string | null = null, manufacturer: string | null = null, item_code: string | null = null): RowIdentity => {
  const r = { item_name, pack, manufacturer, item_code };
  return { ...r, item_key: itemKey(r) };
};

describe('partner stock import — normalisation', () => {
  it('joins strengths to units and unifies dosage forms', () => {
    expect(nameTokens('PARACETAMOL 500MG TAB')).toEqual(['paracetamol', '500mg', 'tablet']);
    expect(nameTokens('Paracetamol 500 mg Tablet')).toEqual(['paracetamol', '500mg', 'tablet']);
    expect(nameTokens("Paracetamol IP 500 mgs Tabs 15's")).toEqual(['paracetamol', '500mg', 'tablet']);
    expect(nameTokens('ALTEPLASE(TPA)50MG INJ')).toEqual(['alteplase', 'tpa', '50mg', 'injection']);
    expect(nameTokens('AMOXY+CLAV 500/125 TAB')).toEqual(['amoxy', 'clav', '500/125', 'tablet']);
    expect(nameTokens('Povidone-Iodine 5% w/v Solution')).toEqual(['povidone', 'iodine', '5%', 'w', 'v', 'solution']);
  });

  it('reads packs', () => {
    expect(parsePack('10 TAB')).toEqual({ count: 10, unit: 'unit' });
    expect(parsePack("15's")).toEqual({ count: 15, unit: 'unit' });
    expect(parsePack('1x15')).toEqual({ count: 15, unit: 'unit' });
    expect(parsePack('100ML')).toEqual({ count: 100, unit: 'ml' });
    expect(parsePack('21.8 g sachet')).toEqual({ count: 21.8, unit: 'g' });
    expect(parsePack('VIAL')).toBeNull();
    expect(packsAgree(parsePack('10 TAB'), parsePack('10 tablets'))).toBe(true);
    expect(packsAgree(parsePack('10 TAB'), parsePack('15 tablets'))).toBe(false);
    expect(packsAgree(null, parsePack('15 tablets'))).toBe(true);
  });

  it('accepts company short codes, refuses different makers', () => {
    expect(makersAgree('ZYD-C', 'Zydus Cadila Healthcare Ltd')).toBe(true);
    expect(makersAgree('ABBOT', 'Abbott India Ltd')).toBe(true);
    expect(makersAgree('TORRE', 'Torrent Pharmaceuticals')).toBe(true);
    expect(makersAgree('CIPLA', 'Sun Pharma Laboratories')).toBe(false);
    expect(makersAgree(null, 'Sun Pharma')).toBe(true);
  });

  it('keys an item by its code, else name + unit + company', () => {
    expect(itemKey({ item_code: 'np-01', item_name: 'X' })).toBe('code:NP-01');
    expect(itemKey({ item_name: 'WARFARIN 1 MG TAB', pack: '10 TAB', manufacturer: 'DEMO' })).toBe('name:warfarin 1 mg tab|10 tab|demo');
    expect(itemKey({ item_name: '' })).toBeNull();
  });
});

describe('partner stock import — matching (conservative)', () => {
  const ctx = buildMatchContext(CATALOGUE, [{ item_key: 'code:NP-77', product_id: 'ctz10' }], [{ product_id: 'pcm650', partner_sku: 'NP-650' }]);

  it('matches the same name, strength and pack from the catalogue', () => {
    expect(matchRow(row('PARACETAMOL 500MG TAB', '15 TAB', 'DEMO'), ctx)).toMatchObject({ productId: 'pcm500', method: 'catalogue' });
    expect(matchRow(row('Paracetamol 250mg/5ml Susp', '60ML'), ctx)).toMatchObject({ productId: 'syr', method: 'catalogue' });
  });

  it('uses the partner\'s remembered link first, then its listing SKU', () => {
    expect(matchRow(row('Anything at all', null, null, 'NP-77'), ctx)).toMatchObject({ productId: 'ctz10', method: 'item_link' });
    expect(matchRow(row('Pcm 650', null, null, 'np-650'), ctx)).toMatchObject({ productId: 'pcm650', method: 'listing' });
  });

  it('never matches a different strength or a look-alike name', () => {
    const strength = matchRow(row('PARACETAMOL 650MG TAB', '10 TAB'), ctx);   // pack differs from catalogue (15)
    expect(strength.productId).toBeNull();
    expect(strength.reason).toMatch(/different pack/);
    expect(strength.candidates.map((c) => c.id)).toContain('pcm650');
    const lookAlike = matchRow(row('LEVOCETIRIZINE 10MG TAB'), ctx);
    expect(lookAlike.productId).toBeNull();
    expect(matchRow(row('PARACETAMOL TAB'), ctx).productId).toBeNull();      // no strength → not exact
    expect(matchRow(row('DOLOMOL 650 TAB'), ctx).productId).toBeNull();
  });

  it('refuses a company that is clearly different', () => {
    expect(matchRow(row('PARACETAMOL 500MG TAB', '15 TAB', 'CIPLA'), ctx).productId).toBeNull();
  });

  it('asks when two products fit, unless the partner lists exactly one of them', () => {
    const both = matchRow(row('AMOXICILLIN 500MG CAP', '10 CAP'), ctx);
    expect(both.productId).toBeNull();
    expect(both.reason).toMatch(/More than one/);
    expect(both.candidates.map((c) => c.id).sort()).toEqual(['amx', 'amx2']);
    const listedCtx = buildMatchContext(CATALOGUE, [], [{ product_id: 'amx2', partner_sku: null }]);
    expect(matchRow(row('AMOXICILLIN 500MG CAP', '10 CAP'), listedCtx)).toMatchObject({ productId: 'amx2', method: 'listing' });
    expect(matchRow(row('AMOXICILLIN 500MG CAP', '10 CAP', 'ALPHA'), ctx)).toMatchObject({ productId: 'amx', method: 'catalogue' });
  });

  it('suggests close catalogue products for an unmatched brand line', () => {
    const r = matchRow(row('CETIRIZINE 5MG TAB', '10 TAB'), ctx);
    expect(r.productId).toBeNull();
    expect(r.candidates[0].id).toBe('ctz10');
    expect(matchRow(row('ZZTOP 5 INJ'), ctx).reason).toMatch(/request it as a new product/);
  });
});
