// Sprint 46 — the catalogue suggestions sheet parser, the workbook / template and the
// list check. Made-up demo items only (no real business data).
import ExcelJS from 'exceljs';
import { itemKey } from '../partnerStockImport/normalise';
import {
  SUGGESTION_COLUMNS, SuggestionSheetError, columnIndex, parseDosageForm, parseGst, parseSchedule, parseSuggestionRows, parseYesNo,
} from './sheet';
import { buildSuggestionTemplate, readSuggestionWorkbook } from './workbook';
import { checkAgainstLists } from './lists';

const HEAD = [...SUGGESTION_COLUMNS] as string[];
const BASE: Record<string, string> = {
  item_name: 'DEMOCILLIN 500 TAB', pack: '10 TAB', company: 'DEMO', generic_name: 'Democillin', strength: '500 mg',
  dosage_form: 'Tablet', drug_schedule: 'Schedule H', cold_chain: 'no', product_class: 'drug', is_new_drug: 'no',
  category: 'Demo antibiotics', hsn_code: '30049099', gst_rate: '12', confidence: 'high', note: 'Check the strip',
};
const row = (over: Partial<Record<string, string>> = {}) => HEAD.map((c) => ({ ...BASE, ...over } as Record<string, string>)[c]);

describe('columnIndex', () => {
  it('accepts exactly the columns, in any order and any case', () => {
    const idx = columnIndex([...HEAD].reverse().map((h) => ` ${h.toUpperCase()} `));
    expect(idx.note).toBe(0);
    expect(idx.item_name).toBe(HEAD.length - 1);
  });
  it('names missing, extra and repeated columns; ignores trailing empty headings', () => {
    expect(() => columnIndex(HEAD.slice(1))).toThrow(/missing item_name/);
    expect(() => columnIndex([...HEAD, 'mrp'])).toThrow(/not expected "mrp"/);
    expect(() => columnIndex([...HEAD, 'pack'])).toThrow(/not expected|more than once/);
    expect(() => columnIndex([...HEAD, '', ''])).not.toThrow();
  });
});

describe('cell readers', () => {
  it('schedules: exact values in any case and the short forms', () => {
    expect(parseSchedule('Schedule H').value).toBe('Schedule H');
    expect(parseSchedule('schedule h1').value).toBe('Schedule H1');
    expect(parseSchedule('H').value).toBe('Schedule H');
    expect(parseSchedule('h1').value).toBe('Schedule H1');
    expect(parseSchedule('X').value).toBe('Schedule X');
    expect(parseSchedule('G').value).toBe('Schedule G');
    expect(parseSchedule('Non-scheduled').value).toBe('Non-scheduled');
    expect(parseSchedule('non scheduled').value).toBe('Non-scheduled');
    expect(parseSchedule('otc').value).toBe('OTC');
    expect(parseSchedule('NDPS').value).toBe('NDPS');
    expect(parseSchedule('')).toEqual({});
  });
  it('schedules: Schedule C / C1 explained, anything else refused', () => {
    expect(parseSchedule('C/C1').problem).toMatch(/separate yes\/no/);
    expect(parseSchedule('Schedule C1').problem).toMatch(/separate yes\/no/);
    expect(parseSchedule('Schedule K').problem).toMatch(/not one of/);
  });
  it('yes / no, dosage forms, GST slabs', () => {
    expect([parseYesNo('Yes'), parseYesNo('n'), parseYesNo(''), parseYesNo('maybe')]).toEqual([true, false, undefined, 'invalid']);
    expect([parseDosageForm('tablets'), parseDosageForm('SYRUP'), parseDosageForm(''), parseDosageForm('Pessary')]).toEqual(['Tablet', 'Syrup', undefined, 'invalid']);
    expect([parseGst('12%'), parseGst('5.0'), parseGst(''), parseGst('15')]).toEqual([12, 5, undefined, 'invalid']);
  });
});

describe('parseSuggestionRows', () => {
  it('reads a valid row with its item key (same as the partner stock import)', () => {
    const [r] = parseSuggestionRows([HEAD, row()]);
    expect(r.problems).toEqual([]);
    expect(r.item_key).toBe(itemKey({ item_name: 'DEMOCILLIN 500 TAB', pack: '10 TAB', manufacturer: 'DEMO' }));
    expect(r.suggested).toEqual({ generic_name: 'Democillin', strength: '500 mg', dosage_form: 'Tablet', drug_schedule: 'Schedule H',
      cold_chain: false, product_class: 'drug', is_new_drug: false, category: 'Demo antibiotics', hsn_code: '30049099', gst_rate: 12 });
    expect(r).toMatchObject({ rowNumber: 2, confidence: 'high', note: 'Check the strip' });
  });
  it('leaves blank cells out of the suggestion and skips blank rows', () => {
    const rows = parseSuggestionRows([HEAD, [], row({ item_name: 'DEMOZOLE 20 CAP', generic_name: '', strength: '', category: '', hsn_code: '3004 90 99',
      cold_chain: '', is_new_drug: '', product_class: 'Medical device', note: '' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(3);
    expect(rows[0].suggested).toEqual({ dosage_form: 'Tablet', drug_schedule: 'Schedule H', product_class: 'device', hsn_code: '30049099', gst_rate: 12 });
    expect(rows[0].note).toBeNull();
  });
  it('reports invalid schedule, class, yes/no, form, GST, HSN and confidence on the row', () => {
    const rows = parseSuggestionRows([HEAD,
      row({ drug_schedule: 'Schedule K' }),
      row({ item_name: 'B', product_class: 'gadget' }),
      row({ item_name: 'C', cold_chain: 'cold', is_new_drug: 'perhaps' }),
      row({ item_name: 'D', dosage_form: 'Pessary', gst_rate: '15', hsn_code: '30A' }),
      row({ item_name: 'E', confidence: 'sure' })]);
    expect(rows[0].problems.join()).toMatch(/drug_schedule "Schedule K"/);
    expect(rows[1].problems.join()).toMatch(/product_class "gadget"/);
    expect(rows[2].problems.join()).toMatch(/cold_chain must be yes or no.*is_new_drug must be yes or no/);
    expect(rows[3].problems.join()).toMatch(/dosage_form "Pessary".*hsn_code "30A".*gst_rate "15"/);
    expect(rows[4].problems.join()).toMatch(/confidence must be high, medium or low/);
  });
  it('a row needs an item name, a confidence and at least one suggested value; repeated items are reported', () => {
    const empty = Object.fromEntries(['generic_name', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain', 'product_class', 'is_new_drug',
      'category', 'hsn_code', 'gst_rate'].map((k) => [k, '']));
    const rows = parseSuggestionRows([HEAD, row({ item_name: '' }), row({ item_name: 'NOTHING', ...empty }), row(), row({ confidence: 'LOW' })]);
    expect(rows[0].problems.join()).toMatch(/item_name is empty/);
    expect(rows[1].problems.join()).toMatch(/no suggested values/);
    expect(rows[2].problems).toEqual([]);
    expect(rows[3].confidence).toBe('low');
    expect(rows[3].problems.join()).toMatch(/already on row 4/);
  });
  it('refuses a sheet without rows or with the wrong heading', () => {
    expect(() => parseSuggestionRows([HEAD])).toThrow(SuggestionSheetError);
    expect(() => parseSuggestionRows([])).toThrow(/empty/);
    expect(() => parseSuggestionRows([['name', 'schedule']])).toThrow(/exactly these columns/);
  });
});

describe('workbook', () => {
  it('the template has the suggestions sheet with exactly the headings, and reads back', async () => {
    const rows = await readSuggestionWorkbook(await buildSuggestionTemplate());
    expect(rows[0]).toEqual(HEAD);
    expect(() => parseSuggestionRows(rows)).toThrow(/no rows/);
  });
  it('reads the sheet named suggestions; refuses a workbook without one and non-xlsx files', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('notes').addRow(['ignore me']);
    const ws = wb.addWorksheet('suggestions');
    ws.addRow(HEAD);
    ws.addRow(row());
    expect(parseSuggestionRows(await readSuggestionWorkbook(Buffer.from(await wb.xlsx.writeBuffer())))[0].problems).toEqual([]);
    const other = new ExcelJS.Workbook();
    other.addWorksheet('Sheet1').addRow(HEAD);
    await expect(readSuggestionWorkbook(Buffer.from(await other.xlsx.writeBuffer()))).rejects.toThrow(/no sheet named "suggestions"/);
    await expect(readSuggestionWorkbook(Buffer.from('item_name,pack\n'))).rejects.toThrow(/suggestions as an Excel workbook/);
  });
});

describe('checkAgainstLists', () => {
  const lists = {
    categories: new Map([['demo antibiotics', { name: 'Demo Antibiotics', active: true }], ['old demo', { name: 'Old Demo', active: false }]]),
    hsn: new Map([['30049099', { name: '30049099', active: true, gst_rate: 12 }], ['30041000', { name: '30049099', active: true, gst_rate: 12 }]]),
  };
  it('uses the list\'s spelling and a merged HSN code\'s target', () => {
    const r = checkAgainstLists({ category: 'demo  ANTIBIOTICS', hsn_code: '30041000', gst_rate: 12 }, lists);
    expect(r.suggested).toMatchObject({ category: 'Demo Antibiotics', hsn_code: '30049099' });
    expect(r.flags).toEqual([]);
  });
  it('keeps a new category / HSN code and flags it; flags retired entries and a differing GST', () => {
    const r = checkAgainstLists({ category: 'Demo Vitamins', hsn_code: '21069099' }, lists);
    expect(r.suggested).toMatchObject({ category: 'Demo Vitamins', hsn_code: '21069099' });
    expect(r.flags.map((f) => f.message).join()).toMatch(/New category "Demo Vitamins".*Alt\+C.*New HSN code 21069099/);
    expect(checkAgainstLists({ category: 'Old demo' }, lists).flags[0].message).toMatch(/no longer used/);
    expect(checkAgainstLists({ hsn_code: '30049099', gst_rate: 18 }, lists).flags[0]).toMatchObject({ field: 'gst_rate' });
  });
});
