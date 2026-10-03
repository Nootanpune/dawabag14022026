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

// ── Sprint 36: merge a duplicate entry into another (admins; audited on the server) ──
export interface MergeResult { products_moved: number; entries_repointed: number }

export async function mergeCategory(id: string, intoId: string, reason?: string) {
  const { data } = await api.post(`/catalogue-lists/categories/${id}/merge`, { into_id: intoId, ...(reason?.trim() ? { reason: reason.trim() } : {}) });
  return data.data as MergeResult & { source: { id: string; name: string }; target: { id: string; name: string } };
}

export async function mergeHsnCode(code: string, intoCode: string, reason: string) {
  const { data } = await api.post(`/catalogue-lists/hsn-codes/${encodeURIComponent(code)}/merge`, { into_code: intoCode, reason: reason.trim() });
  return data.data as MergeResult & { source: { code: string }; target: { code: string } };
}

/** "3 products moved" for the confirmation message. */
export const movedText = (n: number) => (n === 1 ? '1 product moved' : `${n} products moved`);

/** "Used by 3 products" / "Not used by any product". */
export const usedByText = (n: number) => (n > 0 ? `Used by ${n} product${n === 1 ? '' : 's'}` : 'Not used by any product');
