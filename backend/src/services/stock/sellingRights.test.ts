// Sprint 32 — selling rights by licence and buyer type (C-33 partners, C-07 Dawabag's register)
import {
  dawabagMaySupply, dawabagMaySupplySql, partnerMaySupply, partnerMaySupplySql, requiredForm, requiredRegisterType, saleKindFor,
  SELLER_FORMS, sqlRef,
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
  it('names the form each medicine needs, by kind of sale', () => {
    const r = partnerMaySupplySql('v', 'retail', 'p.id');
    expect(r).toMatch(/form = CASE WHEN COALESCE\(\(SELECT sc_p\.schedule_c_c1 FROM products sc_p WHERE sc_p\.id = p\.id\), FALSE\) THEN 'dl21' ELSE 'dl20' END/);
    expect(partnerMaySupplySql('v', 'trade', 'p.id')).toMatch(/THEN 'dl21b' ELSE 'dl20b' END/);
    expect(r).toMatch(/status = 'verified'/);
    expect(r).toMatch(/valid_upto >= CURRENT_DATE/);
    expect(dawabagMaySupplySql('retail', '$1::uuid')).toMatch(/THEN 'retail_21' ELSE 'retail_20' END/);
    expect(dawabagMaySupplySql('trade', 'p.id')).toMatch(/THEN 'wholesale_21b' ELSE 'wholesale_20b' END/);
    expect(SELLER_FORMS.retail).toEqual(['dl20', 'dl21']);
  });
  it('partner stock and own stock both carry the rule for the kind asked', () => {
    expect(partnerStockSql('p.id', 'trade')).toContain(partnerMaySupplySql('v', 'trade', 'p.id'));
    const both = sellableStockSql('p.id', 'retail');
    expect(both).toContain(dawabagMaySupplySql('retail', 'p.id'));
    expect(both).toContain(partnerMaySupplySql('v', 'retail', 'p.id'));
    expect(both).not.toContain('dl20b');
  });
  it('only the two kinds can reach the SQL', () => {
    expect(partnerMaySupplySql('v', "x'; DROP TABLE vendors; --" as any, 'p.id')).toMatch(/THEN 'dl21' ELSE 'dl20' END/);
  });
  it('only fixed column / alias / parameter expressions are accepted (Sprint 34 review)', () => {
    for (const ok of ['p.id', '$1::uuid', '$2', 'v', 'pp.product_id']) expect(sqlRef(ok)).toBe(ok);
    for (const bad of ["p.id OR 1=1", "'x'", 'p.id; DROP TABLE products', '$1::text', '(SELECT 1)', '']) {
      expect(() => sqlRef(bad)).toThrow();
      expect(() => partnerStockSql(bad, 'retail')).toThrow();
      expect(() => sellableStockSql(bad, 'trade')).toThrow();
    }
    expect(() => partnerMaySupplySql('v.id--', 'retail', 'p.id')).toThrow();
  });
});

describe('Schedule C / C1 needs Form 21 / 21B; other medicines Form 20 / 20B (Drugs Rules, Sprint 34)', () => {
  it('the one form required', () => {
    expect(requiredForm('retail', false)).toBe('dl20');
    expect(requiredForm('retail', true)).toBe('dl21');
    expect(requiredForm('trade', false)).toBe('dl20b');
    expect(requiredForm('trade', true)).toBe('dl21b');
    expect(requiredRegisterType('retail', true)).toBe('retail_21');
    expect(requiredRegisterType('trade', false)).toBe('wholesale_20b');
  });
  it('a partner with only Form 20 cannot supply a Schedule C / C1 medicine, and only Form 21 cannot supply the others', () => {
    const only20 = [lic('dl20', '2027-01-01')];
    const only21 = [lic('dl21', '2027-01-01')];
    expect(partnerMaySupply(only20, 'retail', today, false)).toBe(true);
    expect(partnerMaySupply(only20, 'retail', today, true)).toBe(false);
    expect(partnerMaySupply(only21, 'retail', today, true)).toBe(true);
    expect(partnerMaySupply(only21, 'retail', today, false)).toBe(false);
    const only21b = [lic('dl21b', '2027-01-01')];
    expect(partnerMaySupply(only21b, 'trade', today, true)).toBe(true);
    expect(partnerMaySupply(only21b, 'trade', today, false)).toBe(false);
    expect(partnerMaySupply(only21b, 'retail', today, true)).toBe(false);   // wholesale form never covers retail
  });
  it("Dawabag's register likewise, type by type", () => {
    const row = (licence_type: string) => ({ licence_type, valid_upto: '2027-01-01', is_active: true });
    expect(dawabagMaySupply([row('retail_20')], 'retail', today, true)).toBe(false);
    expect(dawabagMaySupply([row('retail_21')], 'retail', today, true)).toBe(true);
    expect(dawabagMaySupply([row('retail_21')], 'retail', today, false)).toBe(false);
    expect(dawabagMaySupply([row('wholesale_20b')], 'trade', today, false)).toBe(true);
    expect(dawabagMaySupply([row('wholesale_20b')], 'trade', today, true)).toBe(false);
    // no medicine named: may it sell anything of that kind (dashboard)
    expect(dawabagMaySupply([row('retail_21')], 'retail', today)).toBe(true);
  });
});
