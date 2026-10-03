// Pure rules of partner batch provenance (Sprint 39, handover D18 for partners; owner
// decision 2026-10-03; Rulebook C-02 buy only from licensed suppliers, C-05 seller of
// record, C-28 recall tracing). Per partner batch: supplier name, supplier drug-licence
// number, purchase invoice number and date — from the stock file (optional columns),
// the portal stock editor, or the live feed JSON. Optional at first; a setting
// (partner_stock.provenance_required) makes them REQUIRED for Schedule H1 and
// cold-chain batches. Immutable once recorded (the database refuses changes).
// No database imports: unit-tested in rules.test.ts.
import { excelSerialToIso } from '../partnerStockImport/values';

export interface Provenance {
  supplier_name: string | null;
  supplier_licence_no: string | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;   // YYYY-MM-DD
}

export const PROVENANCE_FIELDS = ['supplier_name', 'supplier_licence_no', 'supplier_invoice_no', 'supplier_invoice_date'] as const;

const LIMITS: Record<keyof Provenance, number> = { supplier_name: 255, supplier_licence_no: 100, supplier_invoice_no: 100, supplier_invoice_date: 10 };
const LABELS: Record<keyof Provenance, string> = {
  supplier_name: 'supplier name', supplier_licence_no: 'supplier licence number',
  supplier_invoice_no: 'purchase invoice number', supplier_invoice_date: 'purchase invoice date',
};

const text = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

/** 'YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YY', 'DD.MM.YYYY' or an Excel serial → ISO date; NaN-marker 'invalid' when unreadable. */
export function parseInvoiceDate(raw: unknown): string | null | 'invalid' {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) { d = +r[1]; m = +r[2]; y = +r[3] < 100 ? 2000 + +r[3] : +r[3]; }
  else if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s)) ?? 'invalid';
  else return 'invalid';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000) return 'invalid';
  return dt.toISOString().slice(0, 10);
}

/** Cleans what arrived; null when nothing was given. Unreadable or future dates are reported, not kept. */
export function normaliseProvenance(raw: Partial<Record<keyof Provenance, unknown>> | null | undefined, today: string):
  { provenance: Provenance | null; warnings: string[] } {
  if (!raw) return { provenance: null, warnings: [] };
  const warnings: string[] = [];
  const p: Provenance = {
    supplier_name: text(raw.supplier_name, LIMITS.supplier_name),
    supplier_licence_no: text(raw.supplier_licence_no, LIMITS.supplier_licence_no)?.toUpperCase() ?? null,
    supplier_invoice_no: text(raw.supplier_invoice_no, LIMITS.supplier_invoice_no),
    supplier_invoice_date: null,
  };
  const date = parseInvoiceDate(raw.supplier_invoice_date);
  if (date === 'invalid') warnings.push(`Purchase invoice date "${String(raw.supplier_invoice_date).slice(0, 30)}" is not a date; not recorded`);
  else if (date && date > today) warnings.push(`Purchase invoice date ${date} is in the future; not recorded`);
  else p.supplier_invoice_date = date;
  const any = PROVENANCE_FIELDS.some((k) => p[k]);
  return { provenance: any ? p : null, warnings };
}

/** Schedule H1 and cold-chain batches need provenance when the setting is on. */
export function provenanceRequiredFor(product: { drug_schedule: string | null; cold_chain: boolean | null }): boolean {
  return product.drug_schedule === 'Schedule H1' || !!product.cold_chain;
}

/** Fields still missing for the required mode (all four). */
export function missingForRequired(p: Provenance | null): string[] {
  return PROVENANCE_FIELDS.filter((k) => !p?.[k]).map((k) => LABELS[k]);
}

export function sameProvenance(a: Provenance, b: Provenance): boolean {
  return PROVENANCE_FIELDS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

export function requiredMessage(batch: string, missing: string[]): string {
  return `Batch ${batch}: Schedule H1 and refrigerated batches need the supplier's details (${missing.join(', ')}) before they are offered`;
}

/** The provenance a parsed stock line carries (null when none). */
export function provenanceOf(p: Partial<Record<keyof Provenance, string | null>>): Provenance | null {
  const v: Provenance = { supplier_name: p.supplier_name ?? null, supplier_licence_no: p.supplier_licence_no ?? null,
    supplier_invoice_no: p.supplier_invoice_no ?? null, supplier_invoice_date: p.supplier_invoice_date ?? null };
  return PROVENANCE_FIELDS.some((k) => v[k]) ? v : null;
}
