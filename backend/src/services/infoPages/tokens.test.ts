import fs from 'fs';
import path from 'path';
import { INFO_PAGE_KEYS, fillTokens, isInfoPageKey, unknownTokens } from './tokens';

describe('trust pages (Sprint 33)', () => {
  it('fills the numbers from the live settings', () => {
    expect(fillTokens('Tell us within {{returns_report_hours}} hours.', { returns_report_hours: '48' })).toBe('Tell us within 48 hours.');
    expect(fillTokens('{{ sell_min_shelf_days }} days', { sell_min_shelf_days: '30' })).toBe('30 days');
    expect(fillTokens('{{nope}}', {})).toBe('{{nope}}');
    expect(unknownTokens('{{returns_report_hours}} and {{discount}} {{discount}}')).toEqual(['discount']);
  });

  it('knows the three pages', () => {
    expect(INFO_PAGE_KEYS).toEqual(['genuine-medicines', 'expired-damaged-recalled', 'pharmacist-checked']);
    expect(isInfoPageKey('pharmacist-checked')).toBe(true);
    expect(isInfoPageKey('terms')).toBe(false);
  });

  it('the seeded pages use only known placeholders and make no unverifiable claims', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../../database/28_sprint33_medicine_info.sql'), 'utf8');
    const seed = sql.slice(sql.indexOf('INSERT INTO info_pages'), sql.indexOf('ON CONFLICT (page_key, version)'));
    expect(unknownTokens(seed)).toEqual([]);
    for (const k of INFO_PAGE_KEYS) expect(seed).toContain(`'${k}', 1,`);
    // C-17: no superlatives or promises the system cannot back
    expect(seed).not.toMatch(/\b(100%|best|fastest|guarantee[ds]?|always genuine|every order)\b/i);
  });
});
