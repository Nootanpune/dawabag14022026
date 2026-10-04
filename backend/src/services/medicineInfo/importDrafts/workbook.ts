// Sprint 45 — the drafts workbook in memory: read the "drafts" sheet of an uploaded
// .xlsx (never written to disk — standing rule) and build the empty template on the
// fly (no template file kept on the server either).
import ExcelJS from 'exceljs';
import { AppError } from '../../../utils/AppError';
import { assertSafeZip } from '../../../utils/zipGuard';
import { cellText } from '../../partnerStockImport/readFile';
import { DRAFT_COLUMNS, DRAFT_SHEET, MAX_DRAFT_ROWS } from './sheet';

export const MAX_DRAFT_FILE_BYTES = 10 * 1024 * 1024;
const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

export interface SheetSpec {
  /** The sheet's name (compared without case or surrounding spaces) */
  sheet: string;
  /** How many columns the heading should have (a few more are read, so a stray column is reported) */
  columns: number;
  maxRows: number;
  /** What the workbook holds, for the messages ("the drafts", "the suggestions") */
  what: string;
}

/**
 * One named sheet of an uploaded .xlsx as rows of text cells (row 1 = heading), read
 * from memory only (standing rule). Shared by the Sprint 45 drafts import and the
 * Sprint 46 catalogue suggestions import.
 */
export async function readXlsxSheet(buffer: Buffer, spec: SheetSpec): Promise<string[][]> {
  if (!buffer?.length) throw new AppError('The file is empty', 422);
  if (buffer.length > MAX_DRAFT_FILE_BYTES) throw new AppError('The file is larger than 10 MB; split it into smaller files', 413);
  if (!isZip(buffer)) throw new AppError(`Upload ${spec.what} as an Excel workbook (.xlsx)`, 422);
  assertSafeZip(buffer);   // zip-bomb guard before unpacking (security review Sprint 34)
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch {
    throw new AppError('This Excel file could not be read. Open it in Excel, save it again as .xlsx and upload that', 422);
  }
  const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === spec.sheet);
  if (!ws) throw new AppError(`The workbook has no sheet named "${spec.sheet}" (download the template to see the layout)`, 422);
  if (ws.actualRowCount > spec.maxRows + 1) throw new AppError(`The sheet has more than ${spec.maxRows} rows; split it into smaller files`, 422);
  const width = spec.columns + 5;   // a few extra columns, so a stray column is reported, not ignored
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n > spec.maxRows + 1) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => { if (c <= width) cells[c - 1] = cellText(cell.value); });
    rows[n - 1] = Array.from(cells, (x) => x ?? '');
  });
  return Array.from(rows, (r) => r ?? []);
}

/** The "drafts" sheet as rows of text cells (row 1 = heading). */
export function readDraftWorkbook(buffer: Buffer): Promise<string[][]> {
  return readXlsxSheet(buffer, { sheet: DRAFT_SHEET, columns: DRAFT_COLUMNS.length, maxRows: MAX_DRAFT_ROWS, what: 'the drafts' });
}

/** An empty workbook: the "drafts" sheet with its heading row, and a short "how to" sheet. */
export async function buildDraftTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dawabag';
  const ws = wb.addWorksheet(DRAFT_SHEET);
  ws.addRow([...DRAFT_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i === DRAFT_COLUMNS.length - 1 ? 80 : 24; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const help = wb.addWorksheet('how_to');
  [
    ['Medicine information drafts — one row per partner item'],
    ['item_name, pack, company: exactly as the partner\'s billing export prints them (used to find the partner\'s linked product)'],
    ['assumed_composition: the salt(s) and strength(s) the text was written for'],
    ['composition_confidence: high, medium or low'],
    ['drafting_note: anything the checking pharmacist should know (optional)'],
    ['content_json: a JSON object with the editor\'s sections (overview, uses, how_to_use, how_it_works, side_effects, safety,'],
    ['  missed_dose, interactions, quick_tips, facts, faqs, references). Unknown fields are refused.'],
    ['Every row becomes a DRAFT only: a registered pharmacist checks it against the pack insert and sends it; a second one approves (C-19).'],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
