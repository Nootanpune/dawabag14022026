// Sprint 45 — the drafts sheet parser and the partner-only match decision. Made-up demo
// items only (no real business data).
import ExcelJS from 'exceljs';
import { DRAFT_COLUMNS, DraftSheetError, columnIndex, parseContentJson, parseDraftRows } from './sheet';
import { readDraftWorkbook, buildDraftTemplate } from './workbook';
import { matchDraftRow, NOT_IN_CATALOGUE } from './match';
import { buildMatchContext, CatalogueProduct } from '../../partnerStockImport/match';
import { itemKey } from '../../partnerStockImport/normalise';

const HEAD = [...DRAFT_COLUMNS] as string[];
const good = JSON.stringify({ overview: 'Demo text.', uses: ['Demo use'], references: [{ source: 'Pack insert', date: 'March 2026' }] });
const row = (over: Partial<Record<string, string>> = {}) => HEAD.map((c) => ({
  item_name: 'DEMOCILLIN 500 TAB', pack: '10 TAB', company: 'DEMO', assumed_composition: 'Democillin 500 mg',
  composition_confidence: 'high', drafting_note: 'Check the strength', content_json: good, ...over,
} as Record<string, string>)[c]);

describe('columnIndex', () => {
  it('accepts exactly the columns, in any order and any case', () => {
    const idx = columnIndex([...HEAD].reverse().map((h) => ` ${h.toUpperCase()} `));
    expect(idx.content_json).toBe(0);
    expect(idx.item_name).toBe(HEAD.length - 1);
  });
  it('names missing, extra and repeated columns', () => {
    expect(() => columnIndex(HEAD.slice(1))).toThrow(/missing item_name/);
    expect(() => columnIndex([...HEAD, 'price'])).toThrow(/not expected "price"/);
    expect(() => columnIndex([...HEAD, 'pack'])).toThrow(/not expected|more than once/);
  });
  it('ignores trailing empty headings', () => {
    expect(() => columnIndex([...HEAD, '', ''])).not.toThrow();
  });
});

describe('parseContentJson', () => {
  it('accepts the editor format and fills missing sections', () => {
    const r = parseContentJson(good);
    expect(r.problem).toBeNull();
    expect(r.content?.side_effects.common).toEqual([]);
    expect(r.content?.uses).toEqual(['Demo use']);
  });
  it('refuses broken JSON, non-objects, unknown fields, wrong types and empty content', () => {
    expect(parseContentJson('{ overview: ').problem).toMatch(/not valid JSON/);
    expect(parseContentJson('[1,2]').problem).toMatch(/JSON object/);
    expect(parseContentJson('{"overview":"x","price":5}').problem).toMatch(/unknown field/);
    expect(parseContentJson('{"uses":"not a list"}').problem).toMatch(/uses/);
    expect(parseContentJson('{"safety":{"alcohol":{"level":"maybe"}}}').problem).toMatch(/safety\.alcohol\.level/);
    expect(parseContentJson('{}').problem).toMatch(/no text/);
    expect(parseContentJson('').problem).toMatch(/empty/);
  });
});

describe('parseDraftRows', () => {
  it('reads valid rows with their item key (same as the partner stock import)', () => {
    const { rows } = parseDraftRows([HEAD, row(), [], row({ item_name: 'DEMOZOLE 20 CAP', pack: '', company: '' })]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rowNumber: 2, composition_confidence: 'high', problems: [] });
    expect(rows[0].item_key).toBe(itemKey({ item_name: 'DEMOCILLIN 500 TAB', pack: '10 TAB', manufacturer: 'DEMO' }));
    expect(rows[1]).toMatchObject({ rowNumber: 4, pack: null, company: null });
  });
  it('reports each problem on its row', () => {
    const { rows } = parseDraftRows([HEAD,
      row({ composition_confidence: 'sure' }),
      row({ item_name: 'X', content_json: 'nope' }),
      row({ item_name: '', assumed_composition: '' }),
      row({ composition_confidence: 'LOW' })]);
    expect(rows[0].problems.join()).toMatch(/high, medium or low/);
    expect(rows[1].problems.join()).toMatch(/not valid JSON/);
    expect(rows[2].problems.join()).toMatch(/item_name is empty.*assumed_composition is empty/);
    expect(rows[3].composition_confidence).toBe('low');
    expect(rows[3].problems.join()).toMatch(/already on row 2/);
  });
  it('refuses a sheet without rows or with the wrong heading', () => {
    expect(() => parseDraftRows([HEAD])).toThrow(DraftSheetError);
    expect(() => parseDraftRows([])).toThrow(/empty/);
    expect(() => parseDraftRows([['name', 'json']])).toThrow(/exactly these columns/);
  });
});

describe('workbook', () => {
  it('the template has the drafts sheet with exactly the headings, and reads back', async () => {
    const buf = await buildDraftTemplate();
    const rows = await readDraftWorkbook(buf);
    expect(rows[0]).toEqual(HEAD);
    expect(() => parseDraftRows(rows)).toThrow(/no rows/);
  });
  it('reads the sheet named drafts, not the first sheet', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('notes').addRow(['ignore me']);
    const ws = wb.addWorksheet('drafts');
    ws.addRow(HEAD);
    ws.addRow(row());
    const rows = await readDraftWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(parseDraftRows(rows).rows[0].problems).toEqual([]);
  });
  it('refuses a workbook without a drafts sheet, and non-xlsx files', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(HEAD);
    await expect(readDraftWorkbook(Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toThrow(/no sheet named "drafts"/);
    await expect(readDraftWorkbook(Buffer.from('item_name,pack\n'))).rejects.toThrow(/\.xlsx/);
  });
});

describe('matchDraftRow (partner links only)', () => {
  const p = (id: string, name: string): CatalogueProduct => ({ id, name, generic_name: null, net_quantity: '10 tablets', drug_schedule: 'H',
    manufacturer_name: 'Demo Labs', marketed_by: null, mrp_paise: 1000, offer_price_paise: 900, hsn_code: null, gst_rate: 12, cold_chain: false });
  const linked = { item_name: 'DEMOCILLIN 500 TAB', pack: '10 TAB', company: 'DEMO' };
  const keyOf = (r: typeof linked) => itemKey({ item_name: r.item_name, pack: r.pack, manufacturer: r.company });
  const ctx = buildMatchContext([p('p1', 'Democillin 500 mg Tablet'), p('p2', 'Demozole 20 mg Tablet'), p('p3', 'Demofen 400 mg Tablet')],
    [{ item_key: keyOf(linked)!, product_id: 'p1' }], [{ product_id: 'p3', partner_sku: null }]);
  const m = { ctx, draftLinks: new Map([[itemKey({ item_name: 'DEMONEW 5 TAB', pack: '10 TAB', manufacturer: 'DEMO' })!, 'd1']]) };
  const r = (x: typeof linked) => ({ ...x, item_key: keyOf(x) });

  it('the partner\'s link to a live product', () => {
    expect(matchDraftRow(r(linked), m)).toEqual({ productId: 'p1', how: 'item_link', reason: null });
  });
  it('the partner\'s link to a draft product', () => {
    expect(matchDraftRow(r({ item_name: 'DEMONEW 5 TAB', pack: '10 TAB', company: 'DEMO' }), m).productId).toBe('d1');
  });
  it('a product the partner already lists, matched by name as the stock import does', () => {
    expect(matchDraftRow(r({ item_name: 'Demofen 400 mg Tablet', pack: '10 tablets', company: 'Demo Labs' }), m))
      .toMatchObject({ productId: 'p3', how: 'listing' });
  });
  it('a catalogue name the partner has no link to or listing of is NOT taken', () => {
    const res = matchDraftRow(r({ item_name: 'Demozole 20 mg Tablet', pack: '10 tablets', company: 'Demo Labs' }), m);
    expect(res.productId).toBeNull();
    expect(res.reason).toMatch(/Demozole 20 mg Tablet.*no link/);
  });
  it('an unknown item is "not in the catalogue yet"; another partner\'s links do not count', () => {
    expect(matchDraftRow(r({ item_name: 'UNKNOWNIX 1 TAB', pack: '1', company: 'X' }), m).reason).toBe(NOT_IN_CATALOGUE);
    const other = { ctx: buildMatchContext([p('p1', 'Democillin 500 mg Tablet')], [], []), draftLinks: new Map() };
    expect(matchDraftRow(r(linked), other).productId).toBeNull();
  });
});
