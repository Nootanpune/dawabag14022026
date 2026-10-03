// Reads the Dawabag medicine-master workbook (templates/01_Medicine_and_Inventory.xlsx)
// from memory — the upload is never written to disk. Columns are matched by
// heading text, so extra columns (e.g. Manufacturer Address) can be added.
import ExcelJS from 'exceljs';
import { AppError } from '../../utils/AppError';
import { assertSafeZip } from '../../utils/zipGuard';

export type Row = Record<string, unknown> & { _row: number };

// Heading text → field name (★ and spacing ignored, case-insensitive prefix match)
const MASTER_COLUMNS: [string, string][] = [
  ['medicine name', 'name'], ['generic', 'generic_name'], ['sku', 'sku'], ['category', 'category'],
  ['drug schedule', 'drug_schedule'], ['drug form', 'drug_form'], ['strength / pack size', 'pack_size'],
  ['marketed by', 'marketed_by'], ['mrp', 'mrp'], ['offer price', 'offer_price'], ['gst rate', 'gst_rate'],
  ['hsn', 'hsn_code'], ['max qty per order', 'max_qty_per_order'], ['ptr price', 'ptr_price'],
  ['pts price', 'pts_price'], ['institutional price', 'institutional_price'],
  ['min order qty — retailer', 'min_order_qty_retailer'], ['min order qty — wholesaler', 'min_order_qty_wholesaler'],
  ['reorder level', 'reorder_level_qty'], ['storage condition', 'storage_condition'], ['cold chain required', 'cold_chain'],
  ['storage instructions', 'storage_instructions'], ['composition', 'composition'], ['description', 'description'],
  ['active for sale', 'is_active'],
  // Columns the owner adds for C-17 / C-16 (not in the v3.1 template)
  ['net quantity', 'net_quantity'], ['manufacturer name', 'manufacturer_name'], ['manufacturer address', 'manufacturer_address'],
  ['country of origin', 'country_of_origin'], ['nppa ceiling', 'nppa_ceiling_price'],
  // Sprint 34: Drugs Rules Schedule C / C1 (yes / no), set by the pharmacist (C-07, C-33)
  ['schedule c', 'schedule_c_c1'],
  // Sprint 40 (D6): optional product class (drug / device / cosmetic / ayush / general) and new drug (yes / no)
  ['product class', 'product_class'], ['new drug', 'is_new_drug'],
];

const STOCK_COLUMNS: [string, string][] = [
  ['sku', 'sku'], ['medicine name', 'name'], ['batch number', 'batch_number'], ['quantity', 'quantity'],
  ['expiry date', 'expiry'], ['purchase price', 'purchase_price'], ['manufacturing date', 'mfg'],
  ['vendor / supplier', 'supplier'], ['invoice number', 'supplier_invoice'], ['storage location', 'storage_location'],
  ['cold chain batch', 'cold_chain'],
];

const clean = (v: unknown) => String(v ?? '').replace(/★/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === 'object') {
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result ?? null;     // formulas: the computed value
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if (v instanceof Date) return v;
  }
  return v;
}

function readSheet(ws: ExcelJS.Worksheet, columns: [string, string][], keyHeading: string): Row[] {
  let headerRow = 0;
  const map = new Map<number, string>();
  ws.eachRow((row, n) => {
    if (headerRow) return;
    const cells = (row.values as ExcelJS.CellValue[]).map((v) => clean(cellValue(v)));
    if (cells.some((c) => c.startsWith(keyHeading))) {
      headerRow = n;
      cells.forEach((c, i) => {
        // Longest heading prefix wins (e.g. 'manufacturer address' over 'manufacturer')
        const hit = columns.filter(([h]) => c.startsWith(h)).sort((a, b) => b[0].length - a[0].length)[0];
        if (hit && ![...map.values()].includes(hit[1])) map.set(i, hit[1]);
      });
    }
  });
  if (!headerRow) throw new AppError(`Sheet "${ws.name}" has no heading row`, 422);

  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const r: Row = { _row: n };
    (row.values as ExcelJS.CellValue[]).forEach((v, i) => { const f = map.get(i); if (f) r[f] = cellValue(v); });
    const sku = String(r.sku ?? '').trim();
    // Skip blank rows and the template's guidance row under the headings
    if (!sku || /^(unique code|must match|e\.g\.)/i.test(sku)) return;
    rows.push(r);
  });
  return rows;
}

export async function parseCatalogueWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  assertSafeZip(buffer);   // zip-bomb guard before unpacking (security review Sprint 34)
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new AppError('The file is not a readable .xlsx workbook', 422); }
  const master = wb.worksheets.find((w) => /medicine.?master/i.test(w.name));
  const stock = wb.worksheets.find((w) => /opening.?inventory/i.test(w.name));
  if (!master && !stock) throw new AppError('Expected sheets "1_Medicine_Master" and/or "2_Opening_Inventory"', 422);
  return {
    products: master ? readSheet(master, MASTER_COLUMNS, 'medicine name') : [],
    batches: stock ? readSheet(stock, STOCK_COLUMNS, 'sku') : [],
  };
}
