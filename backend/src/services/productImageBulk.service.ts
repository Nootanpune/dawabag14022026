// src/services/productImageBulk.service.ts — bulk pack-photo upload by SKU.
// Each file is named "<SKU>.<jpg|jpeg|png|webp>" and goes through the same path
// as a single upload (productImage.service setProductImage): same byte checks,
// same object-store key scheme products/<id>/<uuid>.<ext>, same C-19 pharmacist
// review (content_status 'pending_review') and the same per-photo audit entry
// (C-46). Files are held in memory only and go straight to the object store
// (standing rule: server is the single source of truth). One bad file never
// fails the batch: every file gets its own result.
import { query } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { skuFromFilename, skuKey } from '../utils/skuFromFilename';
import { setProductImage } from './productImage.service';
import { isObjectStoreConfigured } from './storage.service';

export const BULK_PHOTO_MAX_FILES = 50;

export type BulkPhotoFile = { originalname: string; buffer: Buffer; mimetype: string; size: number };
export type BulkPhotoStatus = 'uploaded' | 'skipped' | 'failed';
export interface BulkPhotoResult {
  file: string;
  sku: string | null;
  product_id?: string;
  status: BulkPhotoStatus;
  message: string;
  content_status?: string;
}

/** SKU key → matching live products (more than one only if two SKUs differ just by case). */
async function productsBySku(keys: string[]) {
  const map = new Map<string, { id: string; sku: string }[]>();
  if (!keys.length) return map;
  const rows = await query<{ id: string; sku: string }>(
    `SELECT id, sku FROM products WHERE deleted_at IS NULL AND UPPER(TRIM(sku)) = ANY($1::text[])`, [keys]);
  for (const r of rows) {
    const k = skuKey(r.sku);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return map;
}

export async function bulkSetProductImages(files: BulkPhotoFile[], adminId: string) {
  // Consistent with a single upload: no object store → the whole request is 503
  if (!isObjectStoreConfigured()) throw new AppError('Document storage is not configured. Please try again later.', 503);
  if (!files.length) throw new AppError('Attach one or more photos as "images"', 400);
  if (files.length > BULK_PHOTO_MAX_FILES) throw new AppError(`Upload at most ${BULK_PHOTO_MAX_FILES} photos at a time`, 400);

  const parsed = files.map((f) => ({ f, name: f.originalname, p: skuFromFilename(f.originalname) }));
  const products = await productsBySku([...new Set(parsed.flatMap(({ p }) => (p.ok ? [skuKey(p.sku)] : [])))]);
  const seen = new Set<string>();
  const results: BulkPhotoResult[] = [];

  for (const { f, name, p } of parsed) {
    if (!p.ok) { results.push({ file: name, sku: null, status: 'failed', message: p.message }); continue; }
    const matches = products.get(skuKey(p.sku)) ?? [];
    if (!matches.length) { results.push({ file: name, sku: p.sku, status: 'skipped', message: `No product with SKU ${p.sku}` }); continue; }
    if (matches.length > 1) {
      results.push({ file: name, sku: p.sku, status: 'failed', message: `More than one product has SKU ${p.sku} (different letter case); use the product page` });
      continue;
    }
    const product = matches[0];
    if (seen.has(product.id)) {
      results.push({ file: name, sku: product.sku, product_id: product.id, status: 'skipped', message: 'Another file in this batch is already used for this SKU' });
      continue;
    }
    seen.add(product.id);
    try {
      // The file name's extension is the declared type; the bytes must agree (utils/imageCheck)
      const saved = await setProductImage(product.id, { buffer: f.buffer, size: f.size, mimetype: p.mimetype }, adminId);
      results.push({ file: name, sku: product.sku, product_id: product.id, status: 'uploaded',
        message: 'Saved; waiting for pharmacist approval (C-19)', content_status: saved.content_status });
    } catch (err) {
      const known = err instanceof AppError;
      if (!known) logger.error(`Bulk photo ${name} failed: ${(err as Error).message}`);
      results.push({ file: name, sku: product.sku, product_id: product.id, status: 'failed',
        message: known ? (err as AppError).message : 'Could not save this photo; try again' });
    }
  }

  const summary = {
    total: results.length,
    uploaded: results.filter((r) => r.status === 'uploaded').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };
  // One batch entry besides the per-photo product_image_set entries (C-46)
  await writeAudit({ userId: null, action: 'product_images_bulk', performedBy: adminId, oldValue: null,
    newValue: { ...summary, files: results.map(({ file, sku, product_id, status }) => ({ file, sku, product_id, status })) } });
  return { summary, results };
}
