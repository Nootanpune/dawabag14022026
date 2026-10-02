// Sprint 32 — selling rights by licence and buyer type (C-33 partners, C-07 Dawabag's register)
import {
  dawabagMaySupply, dawabagMaySupplySql, partnerMaySupply, partnerMaySupplySql, saleKindFor, SELLER_FORMS,
} from './sellingRights';
import { partnerStockSql, sellableStockSql } from './partnerStock';

const today = '2026-10-02';
const lic = (form: string, valid_upto: string | null, status = 'verified') => ({ form, valid_upto, status });

describe('kind of sale by buyer price type', () => {
  it('consumers (and anyone priced as one, e.g. a trade account awaiting KYC) are retail', () => {
    expect(saleKindFor('customer')).toBe('retail');
    expect(saleKindFor(undefined)).toBe('retail');
    expect(saleKindFor('anything else')).toBe('retail');
  });
  it('retailers, wholesalers and doctors / hospitals are trade', () => {
    for (const t of ['b2b_retailer', 'b2b_wholesaler', 'doc_hospital']) expect(saleKindFor(t)).toBe('trade');
  });
});

describe('a partner may supply', () => {
  it('retail buyers only with an in-date, checked Form 20 or 21', () => {
    expect(partnerMaySupply([lic('dl20', '2027-01-01')], 'retail', today)).toBe(true);
    expect(partnerMaySupply([lic('dl21', '2027-01-01')], 'retail', today)).toBe(true);
    expect(partnerMaySupply([lic('dl20b', '2027-01-01'), lic('dl21b', '2027-01-01')], 'retail', today)).toBe(false);
  });
  it('trade buyers only with an in-date, checked Form 20B or 21B', () => {
    expect(partnerMaySupply([lic('dl20b', '2027-01-01')], 'trade', today)).toBe(true);
    expect(partnerMaySupply([lic('dl21b', '2027-01-01')], 'trade', today)).toBe(true);
    expect(partnerMaySupply([lic('dl20', '2027-01-01'), lic('dl21', '2027-01-01')], 'trade', today)).toBe(false);
  });
  it('both with all four', () => {
    const all = ['dl20', 'dl21', 'dl20b', 'dl21b'].map((f) => lic(f, '2027-01-01'));
    expect(partnerMaySupply(all, 'retail', today)).toBe(true);
    expect(partnerMaySupply(all, 'trade', today)).toBe(true);
  });
  it('never on a lapsed, undated, waiting or rejected licence; the last valid day still counts', () => {
    expect(partnerMaySupply([lic('dl20', '2026-10-01')], 'retail', today)).toBe(false);
    expect(partnerMaySupply([lic('dl20', today)], 'retail', today)).toBe(true);
    expect(partnerMaySupply([lic('dl20', null)], 'retail', today)).toBe(false);
    expect(partnerMaySupply([lic('dl20', '2027-01-01', 'pending')], 'retail', today)).toBe(false);
    expect(partnerMaySupply([lic('dl20', '2027-01-01', 'rejected')], 'retail', today)).toBe(false);
    expect(partnerMaySupply([lic('other', '2027-01-01')], 'retail', today)).toBe(false);
    expect(partnerMaySupply([lic('dl20a', '2027-01-01')], 'retail', today)).toBe(false);   // restricted licence: not a pharmacy sale
  });
});

describe("Dawabag's own stock (its licence register)", () => {
  const row = (licence_type: string, valid_upto: string | null, is_active = true) => ({ licence_type, valid_upto, is_active });
  it('retail needs retail_20 / retail_21; trade needs wholesale_20b / wholesale_21b', () => {
    const retailOnly = [row('retail_20', '2027-01-01'), row('retail_21', '2027-01-01')];
    expect(dawabagMaySupply(retailOnly, 'retail', today)).toBe(true);
    expect(dawabagMaySupply(retailOnly, 'trade', today)).toBe(false);   // blocked; dashboard warns
    const tradeOnly = [row('wholesale_21b', '2027-01-01')];
    expect(dawabagMaySupply(tradeOnly, 'trade', today)).toBe(true);
    expect(dawabagMaySupply(tradeOnly, 'retail', today)).toBe(false);
  });
  it('an empty register sells to nobody; lapsed or switched-off rows give no right; no date = in force', () => {
    expect(dawabagMaySupply([], 'retail', today)).toBe(false);
    expect(dawabagMaySupply([row('retail_20', '2026-09-30')], 'retail', today)).toBe(false);
    expect(dawabagMaySupply([row('retail_20', '2027-01-01', false)], 'retail', today)).toBe(false);
    expect(dawabagMaySupply([row('retail_20', null)], 'retail', today)).toBe(true);
    expect(dawabagMaySupply([row('gst', null)], 'retail', today)).toBe(false);
  });
});

describe('the SQL applies the same forms (availability = allocation)', () => {
  it('names exactly the forms of each kind', () => {
    expect(partnerMaySupplySql('v', 'retail')).toMatch(/form IN \('dl20', 'dl21'\)/);
    expect(partnerMaySupplySql('v', 'trade')).toMatch(/form IN \('dl20b', 'dl21b'\)/);
    expect(partnerMaySupplySql('v', 'retail')).toMatch(/status = 'verified'/);
    expect(partnerMaySupplySql('v', 'retail')).toMatch(/valid_upto >= CURRENT_DATE/);
    expect(dawabagMaySupplySql('retail')).toMatch(/'retail_20', 'retail_21'/);
    expect(dawabagMaySupplySql('trade')).toMatch(/'wholesale_20b', 'wholesale_21b'/);
    expect(SELLER_FORMS.retail).toEqual(['dl20', 'dl21']);
  });
  it('partner stock and own stock both carry the rule for the kind asked', () => {
    expect(partnerStockSql('p.id', 'trade')).toContain(partnerMaySupplySql('v', 'trade'));
    const both = sellableStockSql('p.id', 'retail');
    expect(both).toContain(dawabagMaySupplySql('retail'));
    expect(both).toContain(partnerMaySupplySql('v', 'retail'));
    expect(both).not.toContain('dl20b');
  });
  it('only the two kinds can reach the SQL', () => {
    expect(partnerMaySupplySql('v', "x'; DROP TABLE vendors; --" as any)).toMatch(/form IN \('dl20', 'dl21'\)/);
  });
});
