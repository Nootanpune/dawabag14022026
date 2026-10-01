// Turns workbook rows into catalogue records, applying the same rules as the
// product API: prices ≤ MRP and MRP ≤ NPPA ceiling (C-16), pre-packed goods
// declarations (C-17), Schedule X / NDPS never sold online, no expired stock.
import { Row } from './parse';

export interface ProductRecord {
  sku: string; name: string; generic_name: string | null; category: string; drug_schedule: string;
  hsn_code: string | null; gst_rate: number; marketed_by: string | null; composition: string | null;
  description: string | null; storage_instructions: string | null; cold_chain: boolean;
  mrp_paise: number; offer_price_paise: number; ptr_price_paise: number | null; pts_price_paise: number | null;
  institutional_price_paise: number | null; nppa_ceiling_price_paise: number | null;
  max_qty_per_order: number; min_order_qty_retailer: number; min_order_qty_wholesaler: number; reorder_level_qty: number;
  net_quantity: string | null; manufacturer_name: string | null; manufacturer_address: string | null;
  country_of_origin: string; is_active: boolean;
}

export interface BatchRecord {
  sku: string; batch_number: string; quantity: number; expiry_date: string; purchase_price_paise: number;
  manufactured_date: string | null; storage_location: string | null; cold_chain: boolean;
}

export interface Checked<T> { row: number; sku: string; record: T | null; errors: string[]; warnings: string[] }

const SCHEDULES: Record<string, string> = {
  otc: 'OTC', 'schedule g': 'Schedule G', 'schedule h': 'Schedule H', 'schedule h1': 'Schedule H1',
  'schedule x': 'Schedule X', ndps: 'NDPS', g: 'Schedule G', h: 'Schedule H', h1: 'Schedule H1', x: 'Schedule X',
};

const text = (v: unknown) => { const s = String(v ?? '').trim(); return s && s !== '—' ? s : null; };
const yes = (v: unknown) => /^(y|yes|true|1)$/i.test(String(v ?? '').trim());
const num = (v: unknown) => { if (v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '—') return null; const n = Number(String(v).replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
const paise = (v: unknown) => { const n = num(v); return n === null ? null : Number.isNaN(n) ? NaN : Math.round(n * 100); };
const int = (v: unknown, dflt: number) => { const n = num(v); return n === null ? dflt : Number.isInteger(n) ? n : NaN; };

// 'MM/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD' or an Excel date → ISO date; month-only means the last day
export function toDate(v: unknown, endOfMonth: boolean): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [y, mo] = [Number(m[2]), Number(m[1])];
    if (mo < 1 || mo > 12) return null;
    const d = endOfMonth ? new Date(Date.UTC(y, mo, 0)) : new Date(Date.UTC(y, mo - 1, 1));
    return d.toISOString().slice(0, 10);
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^\d{4}-\d{2}-\d{2}$/);
  return m ? s : null;
}

export function checkProduct(r: Row): Checked<ProductRecord> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sku = text(r.sku)?.toUpperCase() ?? '';
  const name = text(r.name);
  const schedule = SCHEDULES[String(r.drug_schedule ?? '').trim().toLowerCase()];
  const mrp = paise(r.mrp), offer = paise(r.offer_price);
  const prices: Record<string, number | null> = {
    ptr: paise(r.ptr_price), pts: paise(r.pts_price), institutional: paise(r.institutional_price), nppa: paise(r.nppa_ceiling_price),
  };
  const gst = num(r.gst_rate);
  const hsn = text(r.hsn_code)?.replace(/\s/g, '') ?? null;

  if (!/^[A-Z0-9][A-Z0-9-]{2,99}$/.test(sku)) errors.push('SKU must be 3–100 letters, digits or hyphens');
  if (!name || name.length < 2) errors.push('Medicine name is required');
  if (!text(r.category)) errors.push('Category is required');
  if (!schedule) errors.push('Drug schedule must be OTC, Schedule G, H, H1, X or NDPS');
  if (mrp === null || Number.isNaN(mrp) || mrp <= 0) errors.push('MRP must be a positive amount');
  if (offer === null || Number.isNaN(offer) || offer <= 0) errors.push('Offer price must be a positive amount');
  if (gst === null || ![0, 5, 12, 18, 28].includes(gst)) errors.push('GST rate must be 0, 5, 12, 18 or 28');
  if (hsn && !/^\d{4,8}$/.test(hsn)) errors.push('HSN code must be 4–8 digits');
  for (const [k, v] of Object.entries(prices)) if (Number.isNaN(v as number)) errors.push(`${k.toUpperCase()} price is not a number`);
  // C-16: nothing above MRP; MRP within the NPPA ceiling
  if (mrp && offer && offer > mrp) errors.push('Offer price is above MRP');
  for (const k of ['ptr', 'pts', 'institutional']) if (mrp && prices[k] && (prices[k] as number) > mrp) errors.push(`${k.toUpperCase()} price is above MRP`);
  if (mrp && prices.nppa && mrp > prices.nppa) errors.push('MRP is above the NPPA ceiling price');

  const qty = {
    max: int(r.max_qty_per_order, 3), minR: int(r.min_order_qty_retailer, 1), minW: int(r.min_order_qty_wholesaler, 10), reorder: int(r.reorder_level_qty, 10),
  };
  for (const [k, v] of Object.entries(qty)) if (Number.isNaN(v) || v < 0) errors.push(`Quantity field ${k} must be a whole number`);
  if (qty.max === 0 || qty.minR === 0 || qty.minW === 0) errors.push('Order quantities must be at least 1');

  let active = r.is_active === undefined || r.is_active === null || String(r.is_active).trim() === '' ? true : yes(r.is_active);
  if (schedule === 'Schedule X' || schedule === 'NDPS') { active = false; warnings.push(`${schedule} is never sold online; listed as inactive`); }
  // C-17 declarations: net quantity and manufacturer default from the template's pack size / marketer
  const net = text(r.net_quantity) ?? text(r.pack_size);
  const maker = text(r.manufacturer_name) ?? text(r.marketed_by);
  const makerAddress = text(r.manufacturer_address);
  if (!net) errors.push('Net quantity (or Strength / Pack Size) is required');
  if (!makerAddress && active) { active = false; warnings.push('No manufacturer address column/value: imported as inactive until it is added (C-17)'); }

  const storage = [text(r.storage_instructions), text(r.storage_condition)].filter(Boolean).join(' — ') || null;
  const cold = yes(r.cold_chain) || /refrigerat|2\s*[–-]\s*8|frozen/i.test(String(r.storage_condition ?? ''));
  if (errors.length) return { row: r._row, sku, record: null, errors, warnings };
  return {
    row: r._row, sku, errors, warnings,
    record: {
      sku, name: name!, generic_name: text(r.generic_name), category: text(r.category)!, drug_schedule: schedule!,
      hsn_code: hsn, gst_rate: gst!, marketed_by: text(r.marketed_by), composition: text(r.composition),
      description: text(r.description), storage_instructions: storage, cold_chain: cold,
      mrp_paise: mrp!, offer_price_paise: offer!, ptr_price_paise: prices.ptr, pts_price_paise: prices.pts,
      institutional_price_paise: prices.institutional, nppa_ceiling_price_paise: prices.nppa,
      max_qty_per_order: qty.max, min_order_qty_retailer: qty.minR, min_order_qty_wholesaler: qty.minW,
      reorder_level_qty: qty.reorder, net_quantity: net, manufacturer_name: maker, manufacturer_address: makerAddress,
      country_of_origin: text(r.country_of_origin) ?? 'India', is_active: active,
    },
  };
}

export function checkBatch(r: Row, today = new Date()): Checked<BatchRecord> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sku = text(r.sku)?.toUpperCase() ?? '';
  const batch = text(r.batch_number);
  const qty = num(r.quantity);
  const expiry = toDate(r.expiry, true);
  const cost = paise(r.purchase_price);
  if (!batch) errors.push('Batch number is required');
  if (qty === null || !Number.isInteger(qty) || qty <= 0) errors.push('Quantity must be a whole number above 0');
  if (!expiry) errors.push('Expiry date must be MM/YYYY');
  if (cost === null || Number.isNaN(cost) || cost < 0) errors.push('Purchase price is required');
  const iso = today.toISOString().slice(0, 10);
  if (expiry && expiry <= iso) errors.push(`Batch expired on ${expiry}; do not bring expired stock into the system`);
  else if (expiry) {
    const days = (Date.parse(expiry) - Date.parse(iso)) / 864e5;
    if (days <= 30) warnings.push('Expires within 30 days: it will not be sold (C-27)');
  }
  if (errors.length) return { row: r._row, sku, record: null, errors, warnings };
  return {
    row: r._row, sku, errors, warnings,
    record: {
      sku, batch_number: batch!, quantity: qty!, expiry_date: expiry!, purchase_price_paise: cost!,
      manufactured_date: toDate(r.mfg, false), storage_location: text(r.storage_location), cold_chain: yes(r.cold_chain),
    },
  };
}
