// src/services/productImage.service.ts — product pack photos.
// Photos live only in the server object store under products/<productId>/…
// (standing rule: the server is the single source of truth); the bucket stays
// private and clients get short-lived signed GET links. A new photo is product
// content like the copy: it goes back to the pharmacist's content review (C-19)
// and customers see it only once approved, so a photo that is not of the actual
// product (or carries claims on the pack) is caught before it is shown.
// Every change is audit-logged (C-46).
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../config/database';
import { cacheDel } from '../config/redis';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { validateProductImage } from '../utils/imageCheck';
import { getCatalogueObjectUrl, isObjectStoreConfigured, putPrivateObject } from './storage.service';

// Links live an hour and are reused for 50 minutes, so a browser sees the same URL
// (and its cached photo) across page views. Presigning is local CPU work; the
// cache is this process's memory only and holds links, never photos.
const URL_TTL_SECONDS = 3600;
const URL_REUSE_MS = 50 * 60 * 1000;
const MAX_CACHED = 5000;
const urlCache = new Map<string, { url: string; until: number }>();
let warned = false;

export async function imageUrlFor(key: string | null | undefined): Promise<string | null> {
  if (!key || !isObjectStoreConfigured()) return null;
  const hit = urlCache.get(key);
  if (hit && hit.until > Date.now()) return hit.url;
  try {
    const url = await getCatalogueObjectUrl(key, URL_TTL_SECONDS);
    if (urlCache.size >= MAX_CACHED) urlCache.clear();
    urlCache.set(key, { url, until: Date.now() + URL_REUSE_MS });
    return url;
  } catch (err) {
    if (!warned) { warned = true; logger.warn(`Product photo links unavailable: ${(err as Error).message}`); }
    return null;
  }
}

// SQL for the photo a customer may see: only after pharmacist approval (C-19)
export const approvedImageKeySql = (alias = 'p') =>
  `CASE WHEN ${alias}.content_status = 'approved' THEN ${alias}.s3_image_key END`;

// Adds image_url to each row from the given key column (dropped from the output)
export async function withImageUrls<T extends Record<string, any>>(rows: T[], keyField: string) {
  const urls = await Promise.all(rows.map((r) => imageUrlFor(r[keyField])));
  return rows.map((r, i) => {
    const { [keyField]: _key, ...rest } = r;
    return { ...rest, image_url: urls[i] } as Omit<T, typeof keyField> & { image_url: string | null };
  });
}

type UploadedFile = { buffer: Buffer; mimetype: string; size: number };

async function productForImage(productId: string) {
  const p = await queryOne<Record<string, any>>(
    `SELECT id, s3_image_key, content_status
     FROM products WHERE id = $1 AND deleted_at IS NULL`, [productId]);
  if (!p) throw new AppError('Product not found', 404);
  return p;
}

export async function setProductImage(productId: string, file: UploadedFile | undefined, adminId: string) {
  const before = await productForImage(productId);
  const type = validateProductImage(file);
  const key = `products/${productId}/${uuidv4()}.${type.ext}`;
  // The old object stays in the store; the product simply points at the new one
  await putPrivateObject(key, file!.buffer, type.contentType, {
    product_id: productId, uploaded_by: adminId, uploaded_at: new Date().toISOString(),
  });
  // Copy is unchanged, so its claim flags (content_flags) still stand for the reviewer
  await query(
    `UPDATE products SET s3_image_key = $2, content_status = 'pending_review', updated_at = NOW() WHERE id = $1`,
    [productId, key]);
  await writeAudit({ userId: null, action: 'product_image_set', performedBy: adminId,
    oldValue: { product_id: productId, s3_image_key: before.s3_image_key, content_status: before.content_status },
    newValue: { product_id: productId, s3_image_key: key, content_type: type.contentType, size_bytes: file!.size, content_status: 'pending_review' } });
  await cacheDel(`product:${productId}`);
  return { id: productId, s3_image_key: key, image_url: await imageUrlFor(key), content_status: 'pending_review' };
}

// Removing a photo shows nothing new, so it needs no review
export async function clearProductImage(productId: string, adminId: string) {
  const before = await productForImage(productId);
  if (before.s3_image_key) {
    await query('UPDATE products SET s3_image_key = NULL, updated_at = NOW() WHERE id = $1', [productId]);
    await writeAudit({ userId: null, action: 'product_image_removed', performedBy: adminId,
      oldValue: { product_id: productId, s3_image_key: before.s3_image_key }, newValue: { product_id: productId, s3_image_key: null } });
    await cacheDel(`product:${productId}`);
  }
  return { id: productId, s3_image_key: null, image_url: null };
}
