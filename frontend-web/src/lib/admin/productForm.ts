// Product form model: field specs, prefill from the public detail, and the
// conversion to the API body (rupees typed → paise sent). Values are strings
// while editing; nothing is stored outside React state.
import type { ProductDetail } from '../products/api';
import { rupeesToPaise } from './format';
import type { ProductBody } from './products';

export type FieldKind = 'text' | 'textarea' | 'rupees' | 'int';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** may be sent as null to clear it */
  nullable?: boolean;
  /** the public detail does not return it, so on edit a blank means "keep" */
  hiddenOnDetail?: boolean;
  hint?: string;
}

export const TEXT_FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Brand name', kind: 'text', required: true },
  { key: 'generic_name', label: 'Generic name', kind: 'text', nullable: true },
  { key: 'category', label: 'Category', kind: 'text', required: true },
  { key: 'marketed_by', label: 'Marketed by', kind: 'text', nullable: true },
  { key: 'hsn_code', label: 'HSN code', kind: 'text', nullable: true, hint: '4–8 digits' },
  { key: 'gst_rate', label: 'GST rate (%)', kind: 'int', required: true },
];

// Pre-packed goods declarations shown on the product page (C-17)
export const DECLARATION_FIELDS: FieldSpec[] = [
  { key: 'net_quantity', label: 'Net quantity', kind: 'text', required: true, hint: 'e.g. 10 tablets' },
  { key: 'manufacturer_name', label: 'Manufacturer name', kind: 'text', required: true },
  { key: 'manufacturer_address', label: 'Manufacturer address', kind: 'textarea', required: true },
  { key: 'country_of_origin', label: 'Country of origin', kind: 'text', required: true },
];

// Product copy goes to the pharmacist before it is shown (C-19)
export const COPY_FIELDS: FieldSpec[] = [
  { key: 'composition', label: 'Composition', kind: 'textarea', nullable: true },
  { key: 'description', label: 'Description', kind: 'textarea', nullable: true, hiddenOnDetail: true },
  { key: 'storage_instructions', label: 'Storage instructions', kind: 'textarea', nullable: true },
];

// Prices (C-16): every selling price ≤ MRP ≤ NPPA ceiling
export const PRICE_FIELDS: FieldSpec[] = [
  { key: 'mrp_paise', label: 'MRP (₹)', kind: 'rupees', required: true },
  { key: 'offer_price_paise', label: 'Patient price (₹)', kind: 'rupees', required: true },
  { key: 'ptr_price_paise', label: 'PTR — retailer (₹)', kind: 'rupees', nullable: true, hiddenOnDetail: true },
  { key: 'pts_price_paise', label: 'PTS — wholesaler (₹)', kind: 'rupees', nullable: true, hiddenOnDetail: true },
  { key: 'institutional_price_paise', label: 'Institutional (₹)', kind: 'rupees', nullable: true, hiddenOnDetail: true },
  { key: 'nppa_ceiling_price_paise', label: 'NPPA ceiling (₹)', kind: 'rupees', nullable: true, hiddenOnDetail: true },
];

export const QTY_FIELDS: FieldSpec[] = [
  { key: 'max_qty_per_order', label: 'Max qty per order (patients)', kind: 'int', required: true },
  { key: 'min_order_qty_retailer', label: 'Min order qty — retailer', kind: 'int', required: true, hiddenOnDetail: true },
  { key: 'min_order_qty_wholesaler', label: 'Min order qty — wholesaler', kind: 'int', required: true, hiddenOnDetail: true },
  { key: 'reorder_level_qty', label: 'Reorder level', kind: 'int', required: true, hiddenOnDetail: true },
];

const ALL_FIELDS = [...TEXT_FIELDS, ...DECLARATION_FIELDS, ...COPY_FIELDS, ...PRICE_FIELDS, ...QTY_FIELDS];

export interface ProductFormValues {
  sku: string;
  drug_schedule: string;
  cold_chain: boolean;
  is_active: boolean;
  text: Record<string, string>;
}

const NEW_DEFAULTS: Record<string, string> = {
  country_of_origin: 'India',
  gst_rate: '12',
  max_qty_per_order: '3',
  min_order_qty_retailer: '1',
  min_order_qty_wholesaler: '10',
  reorder_level_qty: '10',
};

export function blankForm(): ProductFormValues {
  const text = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, NEW_DEFAULTS[f.key] ?? '']));
  return { sku: '', drug_schedule: 'OTC', cold_chain: false, is_active: true, text };
}

const rupees = (paise: number | null | undefined) => (paise == null ? '' : (Number(paise) / 100).toFixed(2));

/** Prefill from GET /products/:id. Trade prices, MOQs and unapproved copy are not returned → blank. */
export function formFromDetail(p: ProductDetail): ProductFormValues {
  const src = p as unknown as Record<string, unknown>;
  const text: Record<string, string> = {};
  for (const f of ALL_FIELDS) {
    if (f.hiddenOnDetail && f.key !== 'description') text[f.key] = '';
    else if (f.key === 'offer_price_paise') text[f.key] = rupees(p.price_paise);
    else if (f.kind === 'rupees') text[f.key] = rupees(src[f.key] as number | null);
    else text[f.key] = src[f.key] == null ? '' : String(src[f.key]);
  }
  return { sku: p.sku, drug_schedule: p.drug_schedule ?? 'OTC', cold_chain: !!p.cold_chain, is_active: true, text };
}

function convert(f: FieldSpec, raw: string): { value?: string | number | null; error?: string } {
  const v = raw.trim();
  if (!v) return f.required ? { error: `${f.label} is required` } : { value: null };
  if (f.kind === 'rupees') {
    const p = rupeesToPaise(v);
    return p === null || p <= 0 ? { error: `${f.label}: enter an amount above 0` } : { value: p };
  }
  if (f.kind === 'int') {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? { value: n } : { error: `${f.label}: enter a whole number` };
  }
  return { value: v };
}

/** Client mirror of the server's price rules (C-16). */
function priceError(body: ProductBody, known: Record<string, number | null>): string {
  const get = (k: string) => (k in body ? (body[k] as number | null) : known[k] ?? null);
  const mrp = get('mrp_paise');
  if (mrp == null) return '';
  for (const k of ['offer_price_paise', 'ptr_price_paise', 'pts_price_paise', 'institutional_price_paise']) {
    const v = get(k);
    if (v != null && v > mrp) return `${PRICE_FIELDS.find((f) => f.key === k)?.label.replace(' (₹)', '')} cannot exceed MRP`;
  }
  const ceiling = get('nppa_ceiling_price_paise');
  if (ceiling != null && mrp > ceiling) return 'MRP cannot exceed the NPPA ceiling price';
  return '';
}

export type BuildResult = { body: ProductBody; error?: undefined } | { body?: undefined; error: string };

/** Full body for POST /products; optional blanks are left out. */
export function buildCreateBody(v: ProductFormValues): BuildResult {
  if (v.sku.trim().length < 3) return { error: 'SKU needs at least 3 characters' };
  const body: ProductBody = { sku: v.sku.trim(), drug_schedule: v.drug_schedule, cold_chain: v.cold_chain, is_active: v.is_active };
  for (const f of ALL_FIELDS) {
    const r = convert(f, v.text[f.key] ?? '');
    if (r.error) return { error: r.error };
    if (r.value !== null) body[f.key] = r.value!;
  }
  const e = priceError(body, {});
  return e ? { error: e } : { body };
}

/** Only the changed fields for PATCH /products/:id; blank fields not shown by the detail are kept. */
export function buildPatchBody(v: ProductFormValues, initial: ProductFormValues): BuildResult {
  const body: ProductBody = {};
  if (v.drug_schedule !== initial.drug_schedule) body.drug_schedule = v.drug_schedule;
  if (v.cold_chain !== initial.cold_chain) body.cold_chain = v.cold_chain;
  if (v.is_active !== initial.is_active) body.is_active = v.is_active;
  const known: Record<string, number | null> = {};
  for (const f of ALL_FIELDS) {
    const raw = v.text[f.key] ?? '';
    const before = initial.text[f.key] ?? '';
    if (f.kind === 'rupees' && before) known[f.key] = rupeesToPaise(before);
    if (raw.trim() === before.trim()) continue;
    if (!raw.trim() && (f.hiddenOnDetail || !f.nullable)) {
      if (f.required && !f.hiddenOnDetail) return { error: `${f.label} is required` };
      continue; // blank = keep
    }
    const r = convert({ ...f, required: false }, raw);
    if (r.error) return { error: r.error };
    body[f.key] = r.value ?? null;
  }
  if (!Object.keys(body).length) return { error: 'Nothing has changed' };
  const e = priceError(body, known);
  return e ? { error: e } : { body };
}

/** Maps 422 field paths (API keys) to the form's labels for display. */
export function fieldLabel(key: string): string {
  return ALL_FIELDS.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ');
}
