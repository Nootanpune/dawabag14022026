import { DEMO_CATEGORIES, DEMO_MEDICINES } from './catalogueData';
import { packShotPng } from './packShot';
import { findRestrictedClaims } from '../../utils/claimsCheck';
import { sniffImageType } from '../../utils/imageCheck';

describe('trial demo catalogue', () => {
  it('has ~40 medicines in every category, unique SKUs, prices within MRP', () => {
    expect(DEMO_MEDICINES.length).toBeGreaterThanOrEqual(38);
    expect(new Set(DEMO_MEDICINES.map((m) => m.code)).size).toBe(DEMO_MEDICINES.length);
    for (const c of DEMO_CATEGORIES) expect(DEMO_MEDICINES.some((m) => m.category === c)).toBe(true);
    for (const m of DEMO_MEDICINES) expect(m.offer).toBeLessThanOrEqual(m.mrp);
  });
  it('mostly OTC, some Schedule H, exactly one H1, never X or NDPS (C-08)', () => {
    const by = (s: string) => DEMO_MEDICINES.filter((m) => m.schedule === s).length;
    expect(by('Schedule H1')).toBe(1);
    expect(by('Schedule H')).toBeGreaterThan(5);
    expect(DEMO_MEDICINES.every((m) => ['OTC', 'Schedule H', 'Schedule H1'].includes(m.schedule))).toBe(true);
  });
  it('copy carries no forbidden claims (C-19)', () => {
    for (const m of DEMO_MEDICINES) expect(findRestrictedClaims(m.description, m.composition)).toEqual([]);
  });
  it('draws a valid PNG pack shot', () => {
    const m = DEMO_MEDICINES[0];
    const png = packShotPng({ generic: m.generic, name: m.name, net: m.net, category: m.category, form: m.form });
    expect(sniffImageType(png)?.contentType).toBe('image/png');
    expect(png.length).toBeLessThan(2 * 1024 * 1024);
  });
});
