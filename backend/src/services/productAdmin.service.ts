// src/services/productAdmin.service.ts — the admin catalogue view: every product,
// active or not (including Schedule X/NDPS and imports waiting for C-17 data), with
// all prices and copy status. The public endpoints never expose these fields.
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { imageUrlFor, withImageUrls } from './productImage.service';

export async function adminListProducts(q: string | undefined, page: number, limit: number, status?: 'active' | 'inactive',
  f: { productClass?: string; newDrugOnly?: boolean } = {}) {
  const where = ['p.deleted_at IS NULL'];
  const params: unknown[] = [];
  // Sprint 40 (D6): filter by product class / new drugs
  if (f.productClass) { params.push(f.productClass); where.push(`p.product_class = $${params.length}`); }
  if (f.newDrugOnly) where.push('p.is_new_drug');
  if (q) { params.push(`%${q}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.generic_name ILIKE $${params.length})`); }
  if (status) where.push(status === 'active' ? 'p.is_active' : 'NOT p.is_active');
  const total = Number((await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM products p WHERE ${where.join(' AND ')}`, params))?.n ?? 0);
  params.push(limit, (page - 1) * limit);
  const products = await query(
    `SELECT p.id, p.name, p.generic_name, p.sku, p.category, p.drug_schedule, p.telemedicine_list, p.mrp_paise, p.offer_price_paise,
            p.cold_chain, p.is_active, p.content_status, p.catalogue_state, (p.manufacturer_address IS NOT NULL) AS has_declarations,
            p.online_sale_status, p.online_sale_ref, p.online_sale_reason,   -- Sprint 39 (C-10)
            p.product_class, p.is_new_drug,                                   -- Sprint 40 (D6)
            p.s3_image_key AS image_key,
            COALESCE((SELECT SUM(b.quantity_available - b.quantity_reserved) FROM inventory_batches b
                      WHERE b.product_id = p.id AND NOT b.is_recalled AND b.gdp_status = 'ok' AND b.expiry_date > CURRENT_DATE + 30), 0)::int AS stock_qty
     FROM products p WHERE ${where.join(' AND ')}
     ORDER BY p.name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  // Staff see the current photo whatever its review state
  return { products: (await withImageUrls(products, 'image_key')).map((p: any) => ({ ...p, in_stock: p.stock_qty > 0 })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function adminGetProduct(id: string) {
  const p = await queryOne<any>(`SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!p) throw new AppError('Product not found', 404);
  delete p.search_vector;
  return { ...p, price_paise: p.offer_price_paise, image_url: await imageUrlFor(p.s3_image_key) };
}
