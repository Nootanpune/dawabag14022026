import ExcelJS from 'exceljs';
import { detectDelimiter, parseDelimited, parseHtmlTable } from './delimited';
import { locateTable, readStockFile } from './readFile';
import { detectPreset, mappingFromNames } from './fields';
import { prepareRows } from './rows';

const HEAD = ['Product name', 'Unit', 'Com', 'Shelf', 'Tax%', 'StkIn dt', 'Batch no', 'ExpDt', 'Purc rate', 'PTR', 'MRP', 'Sale rate 1', 'Qty', 'Value'];
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** A small workbook with the MediVision layout (made-up data). */
async function medivisionLike(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  const banner = (t: string) => { const r = ws.addRow([t]); ws.mergeCells(r.number, 1, r.number, HEAD.length); };
  ws.addRow([]);
  banner('TEST PHARMACY');
  banner('Stock Report Of Batch-wise Products Expiring On Or Before 31-12-30');
  ws.addRow(HEAD);
  ws.addRow(['ALPHAMOL 500 TAB', '10 TAB', 'ABC-D', 'A1', 5, d('2026-06-01'), 'B1', d('2027-11-01'), 10, 12, 20, '      18.00', 10, 100]);
  ws.addRow([null, null, null, null, 5, d('2026-06-01'), 'B2', d('2028-01-01'), 10, null, 20, '      18.00', 5, 50]);
  ws.addRow([null, null, null, null, null, null, null, null, null, null, null, 'Totals:', 15, 150]);
  ws.addRow(['BETAZOL INJ', 'VIAL', 'XYZ', 'F2', 12, d('2026-06-01'), 'V9', d('2027-03-01'), 100, 120, 150, '     140.00', 2, 200]);
  ws.addRow([null, null, null, null, null, null, null, null, null, null, null, 'Totals:', 2, 200]);
  ws.addRow([null, null, null, null, null, null, null, null, null, null, null, 'Totals:', 17, 350]);
  banner('Generated at 2026-10-02 13:03:40 by TEST using MediVision Platinum');
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('partner stock import — reading files in memory', () => {
  it('reads a MediVision-style workbook: title block skipped, fill-down, totals and footer skipped', async () => {
    const sheet = await readStockFile(await medivisionLike());
    expect(sheet.kind).toBe('xlsx');
    const t = locateTable(sheet.rows);
    expect(t.headerRow).toBe(4);
    expect(t.headers).toEqual(HEAD);
    const preset = detectPreset(t.headers, t.otherText)!;
    expect(preset.id).toBe('medivision');
    const rows = prepareRows(t.rows, mappingFromNames(t.headers, preset.mapping)!);
    const lines = rows.filter((r) => !r.skip);
    expect(lines.map((r) => [r.parsed.item_name, r.parsed.batch_number, r.parsed.expiry_date, r.parsed.total_quantity])).toEqual([
      ['ALPHAMOL 500 TAB', 'B1', '2027-11-01', 10],
      ['ALPHAMOL 500 TAB', 'B2', '2028-01-01', 5],
      ['BETAZOL INJ', 'V9', '2027-03-01', 2],
    ]);
    expect(lines[1].parsed.filled_down).toBe(true);
    expect(lines[1].parsed.pack).toBe('10 TAB');
    expect(lines[1].itemKey).toBe(lines[0].itemKey);
    expect(lines[0].parsed.sale_rate_paise).toBe(1800);
    expect(rows.filter((r) => r.skip === 'Total line')).toHaveLength(3);
    expect(rows.filter((r) => r.skip && r.skip !== 'Total line')).toHaveLength(1);   // the footer
  });

  it('reads CSV with quotes, BOM and CRLF', async () => {
    const csv = '﻿Item Name,Batch No,Exp,MRP,Qty\r\n"CALCIGEN 500, D3",C1,12/27,"1,250.00",3\r\n';
    const sheet = await readStockFile(Buffer.from(csv));
    expect(sheet.kind).toBe('csv');
    expect(sheet.rows[1]).toEqual(['CALCIGEN 500, D3', 'C1', '12/27', '1,250.00', '3']);
  });

  it('detects semicolon and tab separators', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3\n')).toBe('\t');
    expect(parseDelimited('x|"y|z"\n', '|')).toEqual([['x', 'y|z']]);
  });

  it('reads an HTML table saved as .xls', async () => {
    const html = '<html><body><table><tr><td colspan="3">SHOP</td></tr><tr><th>Item Name</th><th>Batch</th><th>Expiry</th><th>MRP</th><th>Qty</th></tr>'
      + '<tr><td>GAMMA &amp; CO SYP</td><td>G1</td><td>06/28</td><td>99</td><td>4</td></tr></table></body></html>';
    const sheet = await readStockFile(Buffer.from(html));
    expect(sheet.kind).toBe('html');
    expect(parseHtmlTable(html)[0]).toEqual(['SHOP', '', '']);
    const t = locateTable(sheet.rows);
    expect(t.headerRow).toBe(2);
    expect(t.rows[0].cells[0]).toBe('GAMMA & CO SYP');
  });

  it('refuses an old binary .xls with a plain instruction', async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(readStockFile(ole)).rejects.toThrow(/Save As/);
  });

  it('says so when no heading row can be found', () => {
    expect(() => locateTable([['hello', 'world'], ['1', '2']])).toThrow(/column headings/);
  });
});
