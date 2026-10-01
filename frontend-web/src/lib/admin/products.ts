// Admin catalogue: list, create and edit products. Every price rule (C-16:
// prices ≤ MRP ≤ NPPA ceiling) and the pharmacist copy review (C-19) are
// enforced on the server; the form only mirrors them for quick feedback.
import api from '../api';
import type { ProductDetail } from '../products/api';

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
  is_active?: boolean;
  content_status?: string;
  has_declarations?: boolean;
  /** pharmacist's Telemedicine Practice Guidelines list (C-23); null until classified */
  telemedicine_list?: 'O' | 'A' | 'B' | 'prohibited' | null;
  /** signed link to the current pack photo (any review state), or null */
  image_url?: string | null;
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

/** GET /products/admin/list — every product, active or not, for admins. */
export async function fetchAdminProducts(q: string, page: number, limit = 20): Promise<ProductPage> {
  const { data } = await api.get('/products/admin/list', { params: { q: q || undefined, page, limit } });
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

/** Full admin record (GET /products/:id/admin): all prices, limits, status and copy. */
export async function fetchProductForEdit(id: string): Promise<ProductDetail> {
  const { data } = await api.get(`/products/${id}/admin`);
  return data.data as ProductDetail;
}

export async function createProduct(body: ProductBody): Promise<{ id: string }> {
  const { data } = await api.post('/products', body);
  return data.data;
}

export async function updateProduct(id: string, body: ProductBody): Promise<void> {
  await api.patch(`/products/${id}`, body);
}

// ─── Pack photo (stored only in the server object store) ─────────────────────
export const PRODUCT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PRODUCT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export interface ProductPhotoResult {
  id: string;
  s3_image_key: string | null;
  image_url: string | null;
  content_status?: string;
}

/** Quick client check; the server checks the file's bytes again. Returns an error message or null. */
export function productPhotoProblem(file: File): string | null {
  if (!(PRODUCT_PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Choose a JPEG, PNG or WebP photo';
  if (file.size > PRODUCT_PHOTO_MAX_BYTES) return 'The photo must be 2 MB or smaller';
  return null;
}

/** PUT /products/:id/image (multipart "image"). A new photo waits for pharmacist approval (C-19). */
export async function uploadProductPhoto(id: string, file: File): Promise<ProductPhotoResult> {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.put(`/products/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  return data.data;
}

/** DELETE /products/:id/image */
export async function removeProductPhoto(id: string): Promise<ProductPhotoResult> {
  const { data } = await api.delete(`/products/${id}/image`);
  return data.data;
}
