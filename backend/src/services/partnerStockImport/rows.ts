// A mapped stock file → one parsed record per stock line. Handles the layouts
// billing software prints: product name only on a product's first batch row
// (later batch rows inherit it — "fill down"), subtotal / grand total rows, group
// headings and footer text ("Generated at … using MediVision Platinum"), which are
// skipped. Pure: unit-tested in rows.test.ts.
import { FieldKey, Mapping } from './fields';
import { itemKey } from './normalise';
import { parseExpiry, parsePercent, parseQuantity, parseRupeesToPaise } from './values';
import { normaliseProvenance } from '../partnerProvenance/rules';
import { todayIST } from '../../utils/ist';

export interface ParsedRow {
  item_code: string | null;
  item_name: string | null;
  pack: string | null;
  manufacturer: string | null;
  hsn: string | null;
  batch_number: string | null;
  expiry_raw: string | null;
  expiry_date: string | null;
  mrp_paise: number | null;
  ptr_paise: number | null;
  sale_rate_paise: number | null;
  purchase_rate_paise: number | null;
  quantity: number | null;
  free_quantity: number | null;
  /** quantity + free quantity, in selling packs */
  total_quantity: number | null;
  gst_rate: number | null;
  /** Name, pack and company came from the row above (same product, next batch) */
  filled_down: boolean;
  /** Sprint 39: batch provenance, when the file / feed has it (C-02) */
  supplier_name?: string | null;
  supplier_licence_no?: string | null;
  supplier_invoice_no?: string | null;
  supplier_invoice_date?: string | null;
}

export interface PreparedRow {
  rowNumber: number;
  parsed: ParsedRow;
  itemKey: string | null;
  /** Set when the line is not a stock line (total, heading, footer) */
  skip: string | null;
  /** Problems found reading the cells (unreadable numbers, missing values) */
  problems: string[];
  warnings: string[];
}

const TOTAL_CELL = /^(grand\s*|sub\s*)?totals?\s*:?$/i;
const INHERITED: FieldKey[] = ['item_name', 'pack', 'manufacturer', 'item_code', 'hsn'];

function cell(cells: string[], mapping: Mapping, f: FieldKey): string | null {
  const col = mapping[f];
  if (col === null || col === undefined) return null;
  const v = String(cells[col] ?? '').trim().replace(/\s+/g, ' ');
  return v || null;
}

const money = (label: string, raw: string | null, problems: string[]) => {
  const p = parseRupeesToPaise(raw);
  if (p !== null && Number.isNaN(p)) { problems.push(`${label} "${raw}" is not an amount`); return null; }
  return p;
};

export function prepareRows(rows: { rowNumber: number; cells: string[] }[], mapping: Mapping): PreparedRow[] {
  const out: PreparedRow[] = [];
  let last: Partial<Record<FieldKey, string | null>> | null = null;
  for (const { rowNumber, cells } of rows) {
    const v = (f: FieldKey) => cell(cells, mapping, f);
    const problems: string[] = [];
    const warnings: string[] = [];
    const stockCells = ['batch_number', 'expiry', 'quantity', 'mrp'].map((f) => v(f as FieldKey));
    const hasStock = stockCells.some(Boolean);
    const isTotal = cells.some((c) => TOTAL_CELL.test(String(c).trim()));
    const name = v('item_name');

    const base: ParsedRow = {
      item_code: v('item_code'), item_name: name, pack: v('pack'), manufacturer: v('manufacturer'), hsn: v('hsn')?.replace(/\s/g, '') ?? null,
      batch_number: v('batch_number')?.toUpperCase() ?? null, expiry_raw: v('expiry'), expiry_date: null,
      mrp_paise: null, ptr_paise: null, sale_rate_paise: null, purchase_rate_paise: null,
      quantity: null, free_quantity: null, total_quantity: null, gst_rate: null, filled_down: false,
    };

    // Subtotal / grand total lines, and lines with no stock values (headings, footer text)
    if ((isTotal && !base.batch_number) || !hasStock) {
      const skip = isTotal ? 'Total line' : 'No batch, expiry, quantity or MRP on this line';
      if (name && !hasStock && !isTotal) last = Object.fromEntries(INHERITED.map((f) => [f, v(f)]));
      out.push({ rowNumber, parsed: base, itemKey: null, skip, problems, warnings });
      continue;
    }

    // Next batch of the product above: name, unit, company carried down
    if (!name && last?.item_name) {
      for (const f of INHERITED) {
        const key = f === 'hsn' ? 'hsn' : f;
        if (!(base as any)[key]) (base as any)[key] = last[f] ?? null;
      }
      base.filled_down = true;
    } else if (name) {
      last = Object.fromEntries(INHERITED.map((f) => [f, v(f)]));
    }

    base.expiry_date = parseExpiry(base.expiry_raw);
    base.mrp_paise = money('MRP', v('mrp'), problems);
    base.ptr_paise = money('PTR', v('ptr'), problems);
    base.sale_rate_paise = money('Selling rate', v('sale_rate'), problems);
    base.purchase_rate_paise = money('Purchase rate', v('purchase_rate'), problems);
    const q = parseQuantity(v('quantity'));
    const fq = parseQuantity(v('free_quantity'));
    if (q.error) problems.push(q.error);
    if (fq.error) problems.push(`Free quantity: ${fq.error.toLowerCase()}`);
    if (q.note) warnings.push(q.note);
    base.quantity = q.value;
    base.free_quantity = fq.value;
    base.total_quantity = q.value === null ? null : q.value + Math.max(0, fq.value ?? 0);
    const gst = parsePercent(v('gst_rate'));
    if (gst !== null && Number.isNaN(gst)) warnings.push(`GST "${v('gst_rate')}" is not a percentage; ignored`);
    base.gst_rate = gst === null || Number.isNaN(gst) ? null : gst;
    // Provenance is optional: an unreadable date is a warning, never a problem with the stock line
    const prov = normaliseProvenance({ supplier_name: v('supplier_name'), supplier_licence_no: v('supplier_licence'),
      supplier_invoice_no: v('supplier_invoice_no'), supplier_invoice_date: v('supplier_invoice_date') }, todayIST());
    warnings.push(...prov.warnings);
    if (prov.provenance) Object.assign(base, prov.provenance);

    out.push({ rowNumber, parsed: base, itemKey: itemKey(base), skip: null, problems, warnings });
  }
  return out;
}
