// Admin catalogue: list, create and edit products. Every price rule (C-16:
// prices ≤ MRP ≤ NPPA ceiling) and the pharmacist copy review (C-19) are
// enforced on the server; the form only mirrors them for quick feedback.
import api from '../api';
import { fetchProduct, type ProductDetail } from '../products/api';

export const DRUG_SCHEDULES = ['OTC', 'Schedule G', 'Schedule H', 'Schedule H1', 'Schedule X', 'NDPS'] as const;
export type DrugSchedule = (typeof DRUG_SCHEDULES)[number];

export interface AdminProductRow {
  id: string;
  name: string;
  generic_name: string | null;
  sku: string;
  category: string | null;
  drug_schedule: string | null;
  mrp_paise: number;
  offer_price_paise: number;
  cold_chain: boolean;
  stock_qty: string | number;
  in_stock: boolean;
}

export interface ProductPage {
  products: AdminProductRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

/** Body of POST /products and (as a subset) PATCH /products/:id. Prices in paise. */
export type ProductBody = Record<string, string | number | boolean | null>;

export const adminProductKeys = {
  list: (q: string, page: number) => ['admin', 'products', q, page] as const,
  one: (id: string) => ['admin', 'products', 'one', id] as const,
  categories: ['products', 'categories'] as const,
};

/** GET /products/search — lists active, sellable products only (server filter). */
export async function fetchAdminProducts(q: string, page: number, limit = 20): Promise<ProductPage> {
  const { data } = await api.get('/products/search', { params: { q: q || undefined, page, limit } });
  return {
    products: data.data?.products ?? [],
    pagination: data.data?.pagination ?? { page, limit, total: 0, pages: 0 },
  };
}

export async function fetchCategories(): Promise<string[]> {
  const { data } = await api.get('/products/categories');
  const rows: { category: string | null }[] = Array.isArray(data.data) ? data.data : [];
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}

/** Public detail (GET /products/:id) — used to prefill the edit form. */
export function fetchProductForEdit(id: string): Promise<ProductDetail> {
  return fetchProduct(id);
}

export async function createProduct(body: ProductBody): Promise<{ id: string }> {
  const { data } = await api.post('/products', body);
  return data.data;
}

export async function updateProduct(id: string, body: ProductBody): Promise<void> {
  await api.patch(`/products/${id}`, body);
}
