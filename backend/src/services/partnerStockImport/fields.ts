// The Dawabag fields a partner's stock file is mapped onto, the heading words
// billing software uses for them, and built-in presets for known software.
// Pure (no database): unit-tested in fields.test.ts.

export type FieldKey =
  | 'item_name' | 'pack' | 'manufacturer' | 'hsn' | 'batch_number' | 'expiry' | 'mrp'
  | 'ptr' | 'sale_rate' | 'purchase_rate' | 'quantity' | 'free_quantity' | 'gst_rate' | 'item_code'
  // Sprint 39: where the partner bought the batch (optional; required for H1 / cold chain when the setting is on)
  | 'supplier_name' | 'supplier_licence' | 'supplier_invoice_no' | 'supplier_invoice_date';

export interface FieldDef {
  key: FieldKey;
  label: string;
  required: boolean;
  hint: string;
  synonyms: string[];
}

export const FIELDS: FieldDef[] = [
  { key: 'item_name', label: 'Item name', required: true, hint: 'The medicine name as your software shows it',
    synonyms: ['item name', 'product name', 'product', 'item', 'description', 'item description', 'medicine', 'medicine name',
      'particulars', 'name', 'drug name', 'item desc', 'product description'] },
  { key: 'pack', label: 'Pack / strength', required: false, hint: 'e.g. 10 TAB, 15\'S, 100 ML',
    synonyms: ['unit', 'pack', 'packing', 'pack size', 'strength', 'uom', 'pkg', 'packing size', 'pack type'] },
  { key: 'manufacturer', label: 'Company / manufacturer', required: false, hint: 'Full name or your short code',
    synonyms: ['com', 'company', 'manufacturer', 'mfr', 'mfg', 'mfr name', 'mfg name', 'manufacturer name', 'comp',
      'company name', 'make', 'marketed by', 'co', 'mkt by'] },
  { key: 'hsn', label: 'HSN code', required: false, hint: 'Optional',
    synonyms: ['hsn', 'hsn code', 'hsn sac', 'hsn/sac', 'hsncode'] },
  { key: 'batch_number', label: 'Batch number', required: true, hint: 'Printed on the pack',
    synonyms: ['batch no', 'batch', 'batch number', 'b no', 'bno', 'batchno', 'lot', 'lot no', 'batch no.'] },
  { key: 'expiry', label: 'Expiry', required: true, hint: 'MM/YY, MM/YYYY, DD/MM/YYYY or an Excel date',
    synonyms: ['expdt', 'exp dt', 'expiry', 'exp', 'exp date', 'expiry date', 'expiry dt', 'exp.', 'exp. date', 'expiry on'] },
  { key: 'mrp', label: 'MRP', required: true, hint: 'Printed MRP per pack, in rupees',
    synonyms: ['mrp', 'm r p', 'mrp rs', 'new mrp', 'mrp per unit'] },
  { key: 'ptr', label: 'PTR', required: false, hint: 'Price to retailer (optional)',
    synonyms: ['ptr', 'p t r', 'ptr rate'] },
  { key: 'sale_rate', label: 'Selling rate', required: false, hint: 'Your selling rate (optional; must not exceed MRP)',
    synonyms: ['sale rate 1', 'sale rate', 'selling rate', 's rate', 'srate', 'sales rate', 'rate'] },
  { key: 'purchase_rate', label: 'Purchase rate', required: false, hint: 'Optional; kept in your ledger, never shown to buyers',
    synonyms: ['purc rate', 'purchase rate', 'pur rate', 'p rate', 'prate', 'cost', 'cost rate', 'purch rate', 'pur. rate'] },
  { key: 'quantity', label: 'Quantity in stock', required: true, hint: 'Closing stock in selling packs',
    synonyms: ['qty', 'quantity', 'stock', 'closing', 'closing stock', 'closing qty', 'balance', 'balance qty', 'bal qty',
      'cl qty', 'cl stock', 'stock qty', 'current stock', 'clos qty', 'closing bal', 'stk qty'] },
  { key: 'free_quantity', label: 'Free quantity', required: false, hint: 'Optional; added to the quantity',
    synonyms: ['free', 'free qty', 'fqty', 'f qty', 'scheme qty', 'sch qty', 'bonus', 'free stock'] },
  { key: 'gst_rate', label: 'GST %', required: false, hint: 'Optional',
    synonyms: ['tax%', 'gst%', 'gst', 'gst %', 'gst rate', 'tax', 'tax %', 'igst', 'igst%', 'gst per', 'tax rate'] },
  { key: 'item_code', label: 'Your item code', required: false, hint: 'Optional; helps us remember your items',
    synonyms: ['item code', 'code', 'item cd', 'product code', 'icode', 'item id', 'prod code', 'sku'] },
  // Sprint 39 (C-02, C-28): batch provenance — kept once, shown to Dawabag's admin
  { key: 'supplier_name', label: 'Supplier name', required: false, hint: 'Optional; who you bought this batch from',
    synonyms: ['supplier', 'supplier name', 'party', 'party name', 'distributor', 'distributor name', 'vendor', 'vendor name', 'purchased from'] },
  { key: 'supplier_licence', label: 'Supplier licence no.', required: false, hint: "Optional; the supplier's drug licence number",
    synonyms: ['supplier dl', 'supplier dl no', 'supplier licence', 'supplier license', 'supplier licence no', 'supplier license no',
      'party dl', 'party dl no', 'dl no', 'drug licence no', 'drug license no'] },
  { key: 'supplier_invoice_no', label: 'Purchase invoice no.', required: false, hint: 'Optional; your purchase bill number',
    synonyms: ['invoice no', 'purchase invoice', 'purchase invoice no', 'bill no', 'purchase bill no', 'pur bill no', 'inv no', 'supplier invoice no'] },
  { key: 'supplier_invoice_date', label: 'Purchase invoice date', required: false, hint: 'Optional; DD/MM/YYYY',
    synonyms: ['invoice date', 'purchase invoice date', 'bill date', 'purchase bill date', 'pur bill date', 'inv date', 'supplier invoice date', 'purchase date'] },
];

export const REQUIRED_FIELDS = FIELDS.filter((f) => f.required).map((f) => f.key);
export const FIELD_KEYS = FIELDS.map((f) => f.key);

/** Column index per field (null = not in this file). */
export type Mapping = Partial<Record<FieldKey, number | null>>;

/** 'Batch No.' → 'batch no'; 'Tax%' → 'tax%'; 'M.R.P.' → 'm r p'. */
export function normHeader(h: unknown): string {
  return String(h ?? '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// Headings that hold totals or other dates, never the field a prefix suggests
const EXCLUDED_WORDS = /\b(value|amount|amt|total|totals|date|dt|days|disc|discount|margin)\b/;

/** 3 = the heading is a known name for the field, 2 = it starts with one, 0 = no. */
export function headerScore(header: string, field: FieldDef): number {
  const h = normHeader(header);
  if (!h) return 0;
  const syns = field.synonyms.map(normHeader);
  if (syns.includes(h)) return 3;
  const excluded = EXCLUDED_WORDS.test(h) && !(field.key === 'expiry' && /\b(exp|expiry)\b/.test(h));
  if (excluded) return 0;
  // Prefix only for longer synonyms: 'com' must not claim 'commission'
  if (syns.some((s) => s.length >= 3 && h.startsWith(`${s} `))) return 2;
  return 0;
}

/** Best one-to-one suggestion: each column used once, each field once. */
export function suggestMapping(headers: string[]): Mapping {
  const pairs: { field: FieldKey; col: number; score: number; order: number }[] = [];
  FIELDS.forEach((f, order) => headers.forEach((h, col) => {
    const score = headerScore(h, f);
    if (score) pairs.push({ field: f.key, col, score, order });
  }));
  pairs.sort((a, b) => b.score - a.score || a.order - b.order || a.col - b.col);
  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const p of pairs) {
    if (mapping[p.field] !== undefined || used.has(p.col)) continue;
    mapping[p.field] = p.col;
    used.add(p.col);
  }
  for (const f of FIELD_KEYS) if (mapping[f] === undefined) mapping[f] = null;
  return mapping;
}

/** How many different fields a row of cells looks like headings for (header row detection). */
export function headingFieldCount(cells: string[]): number {
  const m = suggestMapping(cells);
  return FIELD_KEYS.filter((k) => m[k] !== null && m[k] !== undefined).length;
}

/** Required fields the mapping leaves out. */
export function missingRequired(mapping: Mapping): FieldKey[] {
  return REQUIRED_FIELDS.filter((k) => mapping[k] === null || mapping[k] === undefined);
}

// ── Presets for known billing software ──────────────────────────────────────
export interface Preset {
  id: string;
  label: string;
  /** Normalised headings the export always has */
  headers: string[];
  /** Text found in the export's footer or title rows */
  marker: RegExp;
  mapping: Partial<Record<FieldKey, string>>;   // field → normalised heading
}

// MediVision Platinum (Allied Softtech, Pune) "Stock Report Of Batch-wise Products":
// Product name | Unit | Com | Shelf | Tax% | StkIn dt | Batch no | ExpDt | Purc rate |
// PTR | MRP | Sale rate 1 | Qty | Value. Shelf, StkIn dt and Value are not used.
export const PRESETS: Preset[] = [
  {
    id: 'medivision',
    label: 'MediVision Platinum (Allied Softtech)',
    headers: ['product name', 'unit', 'com', 'shelf', 'tax%', 'stkin dt', 'batch no', 'expdt', 'purc rate', 'ptr', 'mrp', 'sale rate 1', 'qty', 'value'],
    marker: /medivision/i,
    mapping: {
      item_name: 'product name', pack: 'unit', manufacturer: 'com', gst_rate: 'tax%', batch_number: 'batch no',
      expiry: 'expdt', purchase_rate: 'purc rate', ptr: 'ptr', mrp: 'mrp', sale_rate: 'sale rate 1', quantity: 'qty',
    },
  },
];

/** A heading-name mapping turned into column indexes; null when a named heading is missing. */
export function mappingFromNames(headers: string[], byName: Partial<Record<FieldKey, string>>): Mapping | null {
  const norm = headers.map(normHeader);
  const mapping: Mapping = {};
  for (const f of FIELD_KEYS) {
    const name = byName[f];
    if (!name) { mapping[f] = null; continue; }
    const col = norm.indexOf(name);
    if (col < 0) return null;
    mapping[f] = col;
  }
  return mapping;
}

/** The preset this file matches: most of its headings, or its marker text plus the required ones. */
export function detectPreset(headers: string[], otherText: string[]): Preset | null {
  const norm = new Set(headers.map(normHeader));
  for (const p of PRESETS) {
    const have = p.headers.filter((h) => norm.has(h)).length;
    const marked = otherText.some((t) => p.marker.test(t));
    const mapping = mappingFromNames(headers, p.mapping);
    if (mapping && (have >= Math.ceil(p.headers.length * 0.75) || marked)) return p;
  }
  return null;
}

/** Column indexes → heading names (what is saved per partner). */
export function mappingToNames(headers: string[], mapping: Mapping): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  for (const f of FIELD_KEYS) {
    const col = mapping[f];
    if (col !== null && col !== undefined && headers[col] !== undefined) out[f] = normHeader(headers[col]);
  }
  return out;
}
