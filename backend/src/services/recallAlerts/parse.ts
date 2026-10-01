// Reads a regulator alert list (CDSCO NSQ, FDA Maharashtra, manufacturer) from an
// uploaded .xlsx or .csv held in memory — never written to disk. Columns are found
// by heading text: drug name, batch, manufacturer, reason (C-28).
import ExcelJS from 'exceljs';
import { AppError } from '../../utils/AppError';

export interface AlertLineInput { drug_name: string; batch_number: string; manufacturer?: string; reason?: string }

export const MAX_ALERT_LINES = 3000;

// Heading fragment → field; the first matching fragment wins
const HEADINGS: [RegExp, keyof AlertLineInput][] = [
  [/batch/, 'batch_number'],
  [/manufactur|marketed|firm|company/, 'manufacturer'],
  [/reason|nsq|result|defect|test/, 'reason'],
  [/drug|product|medicine|name/, 'drug_name'],
];

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

function cellText(v: ExcelJS.CellValue): string {
  if (v && typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ('result' in v) return clean((v as ExcelJS.CellFormulaValue).result);
    if ('richText' in v) return clean((v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join(''));
    if ('text' in v) return clean((v as ExcelJS.CellHyperlinkValue).text);
  }
  return clean(v);
}

// RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map(clean));
}

// Table → lines: the header is the first row with a "batch" heading
export function linesFromTable(table: string[][]): AlertLineInput[] {
  const headerAt = table.findIndex((r) => r.some((c) => /batch/i.test(c)));
  if (headerAt < 0) throw new AppError('No "Batch" column found: the list needs drug name and batch number columns', 422);
  const map = new Map<number, keyof AlertLineInput>();
  table[headerAt].forEach((h, i) => {
    const hit = HEADINGS.find(([re, f]) => re.test(h.toLowerCase()) && ![...map.values()].includes(f));
    if (hit) map.set(i, hit[1]);
  });
  if (![...map.values()].includes('drug_name')) throw new AppError('No drug name column found', 422);
  const lines: AlertLineInput[] = [];
  for (const r of table.slice(headerAt + 1)) {
    const l: Partial<AlertLineInput> = {};
    map.forEach((f, i) => { if (r[i]) l[f] = r[i]; });
    if (!l.batch_number && !l.drug_name) continue;                        // blank row
    if (!l.batch_number || !l.drug_name) throw new AppError(`Row "${r.join(' | ').slice(0, 80)}" needs both a drug name and a batch number`, 422);
    lines.push(l as AlertLineInput);
  }
  if (!lines.length) throw new AppError('The list has no lines', 422);
  if (lines.length > MAX_ALERT_LINES) throw new AppError(`At most ${MAX_ALERT_LINES} lines per alert`, 422);
  return lines;
}

export async function parseAlertFile(buffer: Buffer, filename: string): Promise<AlertLineInput[]> {
  if (/\.csv$/i.test(filename)) return linesFromTable(parseCsv(buffer.toString('utf8')));
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new AppError('The file is not a readable .xlsx or .csv list', 422); }
  const ws = wb.worksheets[0];
  if (!ws) throw new AppError('The workbook has no sheet', 422);
  const table: string[][] = [];
  ws.eachRow((row) => { table.push((row.values as ExcelJS.CellValue[]).slice(1).map(cellText)); });
  return linesFromTable(table);
}
