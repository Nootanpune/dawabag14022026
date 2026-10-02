// Checks on one stock line, in plain words. "Problems" keep the line out of the
// partner's ledger; "warnings" are shown but do not block. Pure: unit-tested.
import type { CatalogueProduct } from './match';
import type { ParsedRow } from './rows';
import { daysBetween } from './values';

export const NEVER_ONLINE = ['Schedule X', 'NDPS'];

export interface RowChecks {
  today: string;               // YYYY-MM-DD in India
  minShelfDays: number;        // partnerStock eligibility (C-27)
  /** Packs already reserved for Dawabag orders in this batch */
  reserved?: number;
  /** Recall message when the batch is recalled or on an uncleared alert (C-28) */
  recalled?: string | null;
  /** The partner already lists this product */
  listed?: boolean;
}

export const rupees = (p: number) => `₹${(p / 100).toFixed(2)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const showDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d} ${MONTHS[Number(m) - 1]} ${y}`; };

/** Checks that need only the file. */
export function checkLine(p: ParsedRow, c: RowChecks): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!p.item_name) problems.push('Item name is missing');
  if (!p.batch_number) problems.push('Batch number is missing');
  if (!p.expiry_raw) problems.push('Expiry date is missing');
  else if (!p.expiry_date) problems.push(`Expiry "${p.expiry_raw}" is not a date we can read (use MM/YY or DD/MM/YYYY)`);
  else {
    const days = daysBetween(c.today, p.expiry_date);
    if (days <= 0) problems.push(`Expired on ${showDate(p.expiry_date)}`);
    else if (days <= c.minShelfDays) {
      problems.push(`Expires on ${showDate(p.expiry_date)}, within ${c.minShelfDays} days, so it cannot be sold (C-27)`);
    }
  }
  if (p.quantity === null) problems.push('Quantity is missing');
  if (p.mrp_paise === null) problems.push('MRP is missing');
  else if (p.mrp_paise <= 0) problems.push('MRP must be more than zero');
  // Nothing may be sold above the printed MRP (C-16)
  if (p.mrp_paise && p.mrp_paise > 0) {
    if (p.sale_rate_paise !== null && p.sale_rate_paise > p.mrp_paise) problems.push(`Selling rate ${rupees(p.sale_rate_paise)} is above the MRP ${rupees(p.mrp_paise)} (C-16)`);
    if (p.ptr_paise !== null && p.ptr_paise > p.mrp_paise) problems.push(`PTR ${rupees(p.ptr_paise)} is above the MRP ${rupees(p.mrp_paise)} (C-16)`);
    if (p.purchase_rate_paise !== null && p.purchase_rate_paise > p.mrp_paise) warnings.push('Purchase rate is above the MRP: please check this line');
  }
  return { problems, warnings };
}

/** Checks against the Dawabag product the line was matched to. */
export function checkAgainstProduct(p: ParsedRow, product: CatalogueProduct, c: RowChecks): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (product.drug_schedule && NEVER_ONLINE.includes(product.drug_schedule)) {
    problems.push(`${product.drug_schedule} medicines can never be sold online (C-10)`);
  }
  // Dawabag sells at its catalogue price; a pack printed with a lower MRP cannot be sold at it (C-16)
  if (p.mrp_paise && p.mrp_paise > 0 && p.mrp_paise < product.offer_price_paise) {
    problems.push(`Printed MRP ${rupees(p.mrp_paise)} is below Dawabag's selling price ${rupees(product.offer_price_paise)}, so this batch cannot be sold at the catalogue price (C-16)`);
  } else if (p.mrp_paise && p.mrp_paise !== product.mrp_paise) {
    warnings.push(`MRP differs from Dawabag's catalogue (${rupees(product.mrp_paise)})`);
  }
  if (c.recalled) problems.push(c.recalled);
  if (p.gst_rate !== null && product.gst_rate !== null && Number(p.gst_rate) !== Number(product.gst_rate)) {
    warnings.push(`GST ${p.gst_rate}% differs from Dawabag's catalogue (${product.gst_rate}%)`);
  }
  if (p.hsn && product.hsn_code && p.hsn !== product.hsn_code) warnings.push(`HSN ${p.hsn} differs from Dawabag's catalogue (${product.hsn_code})`);
  if (c.reserved && p.total_quantity !== null && p.total_quantity < c.reserved) {
    warnings.push(`${c.reserved} packs are reserved for Dawabag orders: stock stays at ${c.reserved}`);
  }
  if (product.cold_chain) warnings.push('Refrigerated (2–8 °C): you confirm cold storage when you apply (C-25)');
  if (!c.listed) {
    warnings.push(product.drug_schedule === 'Schedule H1'
      ? 'New listing (Schedule H1): needs the pharmacist\'s name and registration number when you apply; Dawabag reviews it before it sells'
      : 'New listing: Dawabag reviews it before it sells');
  }
  return { problems, warnings };
}

/**
 * Same batch on several lines: quantities are added (the earliest expiry is kept).
 * Expiries in the same month count as the same (software stores "05/27" as the 1st or
 * the 31st); different months are a problem.
 */
export function duplicateBatchChecks(lines: { key: string; rowNumber: number; expiry: string | null }[]) {
  const groups = new Map<string, typeof lines>();
  for (const l of lines) { const g = groups.get(l.key); if (g) g.push(l); else groups.set(l.key, [l]); }
  const result = new Map<number, { problem?: string; warning?: string }>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const expiries = new Set(g.map((l) => l.expiry?.slice(0, 7) ?? null));
    for (const l of g) {
      const others = g.filter((o) => o !== l).map((o) => o.rowNumber).join(', ');
      result.set(l.rowNumber, expiries.size > 1
        ? { problem: `Same batch on row ${others} has a different expiry: correct the file` }
        : { warning: `Same batch also on row ${others}: quantities are added together` });
    }
  }
  return result;
}
