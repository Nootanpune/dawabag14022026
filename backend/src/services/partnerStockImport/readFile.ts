// Reads a partner's stock export from memory (the upload is never written to disk —
// standing rule) into rows of text cells, then finds the heading row under any
// title block (shop name, address, "Stock Report ... as on ...").
// Excel .xlsx: first worksheet. CSV/TSV text. HTML tables saved as .xls (common in
// Indian billing software). A true binary .xls (Excel 97-2003) is refused with a
// plain "save it as .xlsx or CSV" — no maintained, safe reader for it is installed.
import ExcelJS from 'exceljs';
import { AppError } from '../../utils/AppError';
import { assertSafeZip } from '../../utils/zipGuard';
import { decodeText, looksLikeHtml, parseDelimited, parseHtmlTable } from './delimited';
import { headingFieldCount } from './fields';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_DATA_ROWS = 10_000;
export const MAX_COLUMNS = 60;
const HEADER_SCAN_ROWS = 40;
/** Rows read from a sheet at most: title block + data + footer (Sprint 34 review: bounded memory) */
const MAX_SHEET_ROWS = MAX_DATA_ROWS + HEADER_SCAN_ROWS + 50;

export type FileKind = 'xlsx' | 'csv' | 'html';

export interface SheetText {
  kind: FileKind;
  sheetName: string | null;
  /** Cells as text; rows[i] is sheet row i + 1 */
  rows: string[][];
}

const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0xd0cf11e0 && b.readUInt32BE(4) === 0xa1b11ae1;

/** A cell as the partner sees it: dates as YYYY-MM-DD, numbers without float noise. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') {
    if ('result' in v) return cellText((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text ?? '').trim();
    return '';   // error values (#N/A …)
  }
  return String(v).trim();
}

async function readXlsx(buffer: Buffer): Promise<SheetText> {
  const wb = new ExcelJS.Workbook();
  assertSafeZip(buffer);   // zip-bomb guard before unpacking (security review Sprint 34)
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch {
    throw new AppError('This Excel file could not be read. Open it in Excel, save it again as .xlsx (or CSV) and upload that', 422);
  }
  const ws = wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0];
  if (!ws) throw new AppError('The workbook has no sheets', 422);
  const rows: string[][] = [];
  // More filled rows than a file may have: refused before they are walked
  if (ws.actualRowCount > MAX_SHEET_ROWS) {
    throw new AppError(`The file has more than ${MAX_DATA_ROWS} rows; split it into smaller files`, 422);
  }
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n > MAX_SHEET_ROWS) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > MAX_COLUMNS) return;
      // A merged banner (title, footer) counts once, in its first cell
      const slave = cell.isMerged && cell.master && cell.master.address !== cell.address;
      cells[col - 1] = slave ? '' : cellText(cell.value);
    });
    rows[n - 1] = Array.from(cells, (c) => c ?? '');
  });
  return { kind: 'xlsx', sheetName: ws.name, rows: Array.from(rows, (r) => r ?? []) };
}

export async function readStockFile(buffer: Buffer): Promise<SheetText> {
  if (!buffer?.length) throw new AppError('The file is empty', 422);
  if (buffer.length > MAX_FILE_BYTES) throw new AppError('The file is larger than 5 MB', 413);
  if (isZip(buffer)) return readXlsx(buffer);
  if (isOle(buffer)) {
    throw new AppError('This is an old-format Excel file (.xls). Open it in Excel and use Save As → Excel Workbook (.xlsx) or CSV, then upload that file', 422);
  }
  const text = decodeText(buffer);
  if (/\u0000/.test(text.slice(0, 2000))) throw new AppError('This file is not a spreadsheet or CSV export', 422);
  // Read at most the rows a file may have (heading block + data + footer); more is refused
  const cap = MAX_SHEET_ROWS;
  const rows = looksLikeHtml(text) ? parseHtmlTable(text, cap) : parseDelimited(text, undefined, cap);
  if (rows.length > cap) throw new AppError(`The file has more than ${MAX_DATA_ROWS} rows; split it into smaller files`, 422);
  return { kind: looksLikeHtml(text) ? 'html' : 'csv', sheetName: null, rows };
}

export interface LocatedTable {
  headerRow: number;            // 1-based
  headers: string[];
  /** Data rows below the heading, with their sheet row number; blank rows dropped */
  rows: { rowNumber: number; cells: string[] }[];
  /** Text outside the table (title block, footer) — used to recognise the software */
  otherText: string[];
}

const isBlank = (cells: string[]) => cells.every((c) => !String(c ?? '').trim());

/** The heading row is the one (near the top) that names the most Dawabag fields. */
export function locateTable(sheetRows: string[][]): LocatedTable {
  let best = -1;
  let bestCount = 0;
  sheetRows.slice(0, HEADER_SCAN_ROWS).forEach((cells, i) => {
    const count = headingFieldCount((cells ?? []).map((c) => String(c ?? '')));
    if (count > bestCount) { best = i; bestCount = count; }
  });
  if (best < 0 || bestCount < 3) {
    throw new AppError('Could not find the column headings. The file should have a heading row such as "Item Name, Batch No, Expiry, MRP, Qty"', 422);
  }
  // reduce, not Math.max(...rows): spreading many rows overflows the call stack
  const width = Math.min(MAX_COLUMNS, sheetRows.reduce((w, r) => Math.max(w, r?.length ?? 0), 0));
  const headers = Array.from({ length: width }, (_, i) => String(sheetRows[best][i] ?? '').trim() || `Column ${i + 1}`);
  // Trailing "Column N" headings with no data are dropped
  let lastUsed = headers.length - 1;
  while (lastUsed > 0 && /^Column \d+$/.test(headers[lastUsed]) && sheetRows.slice(best + 1).every((r) => !String(r?.[lastUsed] ?? '').trim())) lastUsed--;
  const cols = lastUsed + 1;
  const rows: LocatedTable['rows'] = [];
  for (let i = best + 1; i < sheetRows.length; i++) {
    const cells = Array.from({ length: cols }, (_, c) => String(sheetRows[i]?.[c] ?? '').trim());
    if (isBlank(cells)) continue;
    rows.push({ rowNumber: i + 1, cells });
  }
  if (rows.length > MAX_DATA_ROWS) throw new AppError(`The file has more than ${MAX_DATA_ROWS} rows; split it into smaller files`, 422);
  const otherText = sheetRows.slice(0, best).concat(sheetRows.slice(-5)).flat().map((c) => String(c ?? '').trim()).filter(Boolean);
  return { headerRow: best + 1, headers: headers.slice(0, cols), rows, otherText };
}
