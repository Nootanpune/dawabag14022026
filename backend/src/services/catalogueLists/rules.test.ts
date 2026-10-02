import {
  categoryKey, categoryNameProblems, categoryRenameProblems, hsnEditProblems, findDuplicateCategory, hsnGstMismatch, hsnProblems, tidyHsn, tidyName,
} from './rules';

describe('category names', () => {
  it('are tidied: trimmed, inner spaces collapsed', () => {
    expect(tidyName('  Pain   relief ')).toBe('Pain relief');
  });
  it('match whatever the capitals or spaces', () => {
    expect(categoryKey('Pain  RELIEF ')).toBe(categoryKey('pain relief'));
    expect(categoryKey('Pain relief')).not.toBe(categoryKey('Pain-relief'));
  });
  it('accept ordinary names, including Hindi and & , - ( ) /', () => {
    for (const n of ['Fever & pain', 'Vitamins, minerals', 'Skin (derma)', 'Ayurveda / herbal', 'आयुर्वेद', 'Diabetes care 2']) {
      expect(categoryNameProblems(n)).toEqual([]);
    }
  });
  it('refuse empty, too short, too long, number-only or odd characters, in plain words', () => {
    expect(categoryNameProblems('')).toEqual(['Write a category name of at least 2 letters']);
    expect(categoryNameProblems(' a ')).toEqual(['Write a category name of at least 2 letters']);
    expect(categoryNameProblems('x'.repeat(61)).join(' ')).toMatch(/60 characters/);
    expect(categoryNameProblems('2024').join(' ')).toMatch(/at least one letter/);
    expect(categoryNameProblems('Pain <b>').join(' ')).toMatch(/letters, numbers, spaces/);
  });
  it('a duplicate is found in the list (the existing one is chosen)', () => {
    const list = [{ id: '1', name: 'Fever & pain' }, { id: '2', name: 'Allergy' }];
    expect(findDuplicateCategory(list, '  fever &  PAIN')?.id).toBe('1');
    expect(findDuplicateCategory(list, 'Allergies')).toBeUndefined();
  });
});

describe('HSN codes', () => {
  it('are digits only once spaces and dots are removed', () => {
    expect(tidyHsn('3004 90 99')).toBe('30049099');
    expect(tidyHsn('3004.90')).toBe('300490');
  });
  it('must be 4, 6 or 8 digits with a short description; GST optional but a known slab', () => {
    expect(hsnProblems({ code: '3004', description: 'Medicaments in measured doses', gst_rate: 12 })).toEqual([]);
    expect(hsnProblems({ code: '3004 90 99', description: 'Other medicaments', gst_rate: null })).toEqual([]);
    expect(hsnProblems({ code: '30049', description: 'Medicaments' })).toEqual(['The HSN code must be 4, 6 or 8 digits']);
    expect(hsnProblems({ code: '3004A1', description: 'Medicaments' })).toEqual(['The HSN code must be 4, 6 or 8 digits']);
    expect(hsnProblems({ code: '3004', description: ' ' }).join(' ')).toMatch(/short description/);
    expect(hsnProblems({ code: '3004', description: 'Medicaments', gst_rate: 7 })).toEqual(['GST rate must be 0, 5, 12, 18 or 28']);
  });
  it('a GST mismatch is a plain note, never a change', () => {
    expect(hsnGstMismatch({ code: '3004', gst_rate: 12 }, 5)).toBe('HSN 3004 usually has GST 12%, but this product is set to 5%: check the GST rate (it has not been changed)');
    expect(hsnGstMismatch({ code: '3004', gst_rate: 12 }, '12')).toBeNull();
    expect(hsnGstMismatch({ code: '3004', gst_rate: null }, 5)).toBeNull();
    expect(hsnGstMismatch({ code: '3004', gst_rate: 12 }, null)).toBeNull();
    expect(hsnGstMismatch(null, 5)).toBeNull();
  });
});

// Sprint 32 — Admin → Catalogue lists
describe('renaming a category', () => {
  const others = [{ name: 'Pain relief' }, { name: 'Vitamins' }];
  it('accepts a new, valid name', () => {
    expect(categoryRenameProblems({ name: 'Fever' }, 'Fever and pain', others)).toEqual([]);
  });
  it('accepts a change of capitals of the same entry', () => {
    expect(categoryRenameProblems({ name: 'fever' }, 'Fever', others)).toEqual([]);
  });
  it('refuses a name another entry has (no merging), the same name, and bad names', () => {
    expect(categoryRenameProblems({ name: 'Fever' }, 'pain  RELIEF', others)[0]).toMatch(/"Pain relief" is already in the list/);
    expect(categoryRenameProblems({ name: 'Fever' }, ' Fever ', others)).toEqual(['The new name is the same as the current one']);
    expect(categoryRenameProblems({ name: 'Fever' }, 'x', others)).toEqual(['Write a category name of at least 2 letters']);
  });
});

describe('editing an HSN entry', () => {
  const cur = { code: '30049099', description: 'Other medicaments' };
  it('a code in use keeps its number; its words and GST may change', () => {
    expect(hsnEditProblems(cur, { code: '30049011' }, 3, false)[0]).toMatch(/used by 3 products, so the code cannot be changed/);
    expect(hsnEditProblems(cur, { description: 'Medicaments, other', gst_rate: 12 }, 3, false)).toEqual([]);
    expect(hsnEditProblems(cur, { code: '3004 90 99', description: 'Medicaments, other' }, 3, false)).toEqual([]);   // same code typed with spaces
  });
  it('an unused code can be corrected, to a valid code not already listed', () => {
    expect(hsnEditProblems(cur, { code: '30049011' }, 0, false)).toEqual([]);
    expect(hsnEditProblems(cur, { code: '300490' }, 0, true)).toEqual(['HSN 300490 is already in the list']);
    expect(hsnEditProblems(cur, { code: '30049' }, 0, false)).toEqual(['The HSN code must be 4, 6 or 8 digits']);
  });
  it('checks the description and GST slab', () => {
    expect(hsnEditProblems(cur, { description: 'ab' }, 0, false)).toEqual(['Add a short description (what goods the code covers)']);
    expect(hsnEditProblems(cur, { gst_rate: 7 }, 0, false)).toEqual(['GST rate must be 0, 5, 12, 18 or 28']);
    expect(hsnEditProblems(cur, { gst_rate: null }, 0, false)).toEqual([]);
  });
});
