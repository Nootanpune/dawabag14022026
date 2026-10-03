// Sprint 31 — the product category and HSN code lists kept on the server.
// Staff pick from them in "New products to complete" and the product form, and
// add to them with Alt+C or "+ New" (admins and pharmacists; audited, C-46).
// This file calls the API and holds small pure helpers; nothing is stored in the browser.
import api from './api';

export interface Category {
  id: string;
  name: string;
  is_active: boolean;
  product_count: number;
  /** Sprint 36: merged into another entry (kept switched off so old spellings find it) */
  merged_into?: string | null;
  merged_into_name?: string | null;
}

export interface HsnCode {
  code: string;
  description: string | null;
  gst_rate: number | null;
  is_active: boolean;
  product_count: number;
  merged_into?: string | null;
}

export interface Created<T> {
  created: boolean;
  /** set when the entry was already in the list and was chosen instead */
  note: string | null;
  value: T;
}

export const listKeys = {
  categories: ['catalogue-lists', 'categories'] as const,
  hsn: ['catalogue-lists', 'hsn-codes'] as const,
};

export const GST_SLABS = [0, 5, 12, 18, 28] as const;

export async function fetchCategoryList(): Promise<Category[]> {
  const { data } = await api.get('/catalogue-lists/categories');
  return data.data;
}

export async function fetchHsnList(): Promise<HsnCode[]> {
  const { data } = await api.get('/catalogue-lists/hsn-codes');
  return data.data;
}

export async function createCategory(name: string): Promise<Created<{ id: string; name: string }>> {
  const { data } = await api.post('/catalogue-lists/categories', { name });
  return { created: data.data.created, note: data.data.note, value: data.data.category };
}

export async function createHsnCode(body: { code: string; description: string; gst_rate: number | null }): Promise<Created<Pick<HsnCode, 'code' | 'description' | 'gst_rate'>>> {
  const { data } = await api.post('/catalogue-lists/hsn-codes', body);
  return { created: data.data.created, note: data.data.note, value: data.data.hsn };
}

// ── Pure helpers (mirror the server's checks so the dialog can explain before sending) ──

/** Alt+C (Option+C on a Mac, where the key is "ç"): the quick-create shortcut. */
export function isQuickCreateKey(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; code?: string; key: string }): boolean {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  return e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key === 'ç';
}

export const tidyName = (s: string) => s.trim().replace(/\s+/g, ' ');
export const categoryKey = (s: string) => tidyName(s).toLowerCase();
export const tidyHsn = (s: string) => s.replace(/[\s.]/g, '');
export const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

export function categoryNameProblem(raw: string): string | null {
  const name = tidyName(raw);
  if (name.length < 2) return 'Write a category name of at least 2 letters';
  if (name.length > 60) return 'Keep the category name to 60 characters';
  if (!/\p{L}/u.test(name)) return 'A category name needs at least one letter';
  if (!/^[\p{L}\p{M}\p{N} &,.'()/+-]+$/u.test(name)) return "Use letters, numbers, spaces and & , . - ' ( ) / + only";
  return null;
}

export function hsnProblem(code: string, description: string): string | null {
  if (!HSN_RE.test(tidyHsn(code))) return 'The HSN code must be 4, 6 or 8 digits';
  if (tidyName(description).length < 3) return 'Add a short description (what goods the code covers)';
  return null;
}

export function findCategory(list: Category[], text: string): Category | undefined {
  const k = categoryKey(text);
  return k ? list.find((c) => categoryKey(c.name) === k) : undefined;
}

export function hsnLabel(h: Pick<HsnCode, 'code' | 'description' | 'gst_rate'>): string {
  return [h.code, h.description ? `— ${h.description}` : '', h.gst_rate != null ? `(GST ${h.gst_rate}%)` : ''].filter(Boolean).join(' ');
}

/** Plain note when the HSN's usual GST differs from the product's; GST is never changed for you. */
export function hsnGstNote(hsn: Pick<HsnCode, 'code' | 'gst_rate'> | undefined, productGst: number | string | null | undefined): string | null {
  if (!hsn || hsn.gst_rate == null || productGst == null || productGst === '') return null;
  const g = Number(productGst);
  if (!Number.isFinite(g) || g === hsn.gst_rate) return null;
  return `HSN ${hsn.code} usually has GST ${hsn.gst_rate}%, but this product is set to ${g}%: check the GST rate (it has not been changed)`;
}
