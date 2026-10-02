// Sprint 32 — Admin → Catalogue lists: the category and HSN lists with every entry
// (switched-off ones too), search, rename / correct and switch off / on. Admins change
// them; pharmacists read them (the server enforces both, C-46 audit on the server).
// Nothing is kept in the browser.
import api from '../api';
import type { Category, HsnCode } from '../catalogueLists';

export const manageKeys = {
  categories: (q: string) => ['catalogue-lists', 'manage', 'categories', q] as const,
  hsn: (q: string) => ['catalogue-lists', 'manage', 'hsn', q] as const,
};

const listParams = (q: string) => (q.trim() ? { q: q.trim() } : { all: 'true' });

export async function fetchAllCategories(q = ''): Promise<Category[]> {
  const { data } = await api.get('/catalogue-lists/categories', { params: listParams(q) });
  return data.data;
}

export async function fetchAllHsnCodes(q = ''): Promise<HsnCode[]> {
  const { data } = await api.get('/catalogue-lists/hsn-codes', { params: listParams(q) });
  return data.data;
}

export async function updateCategory(id: string, body: { name?: string; is_active?: boolean }) {
  const { data } = await api.patch(`/catalogue-lists/categories/${id}`, body);
  return data.data as { category: Category; products_updated: number };
}

export async function updateHsnCode(code: string, body: { code?: string; description?: string; gst_rate?: number | null; is_active?: boolean }) {
  const { data } = await api.patch(`/catalogue-lists/hsn-codes/${encodeURIComponent(code)}`, body);
  return data.data as { hsn: HsnCode };
}

/** "Used by 3 products" / "Not used by any product". */
export const usedByText = (n: number) => (n > 0 ? `Used by ${n} product${n === 1 ? '' : 's'}` : 'Not used by any product');
