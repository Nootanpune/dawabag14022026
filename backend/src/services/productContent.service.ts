// src/services/productContent.service.ts — pharmacist review of product copy (Rulebook C-19)
// Any change to name, description, composition or storage text sends the
// product back for review; the public page hides the description until then.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { cacheDel } from '../config/redis';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { findRestrictedClaims } from '../utils/claimsCheck';
import { withImageUrls } from './productImage.service';

export const COPY_FIELDS = ['name', 'description', 'composition', 'storage_instructions'] as const;

export function copyFlags(p: Record<string, any>) {
  return findRestrictedClaims(p.name, p.description, p.composition, p.storage_instructions);
}

// The pack photo is reviewed with the copy: it must show the actual product (C-19)
export async function contentQueue() {
  return withImageUrls(await query(
    `SELECT id, sku, name, drug_schedule, description, composition, storage_instructions, content_status,
            content_flags, updated_at, s3_image_key AS image_key
     FROM products WHERE content_status = 'pending_review' AND deleted_at IS NULL
       -- drafts are completed and approved in "New products to complete" (Sprint 29)
       AND catalogue_state NOT IN ('draft', 'rejected')
     ORDER BY updated_at LIMIT 200`), 'image_key');
}

/**
 * A change to a live product's buyer copy (e.g. the description added after a new
 * product was approved, Sprint 31): saved, hidden from buyers and sent back to the
 * pharmacist's "Product copy" queue — the same as an edit in the product form (C-19).
 */
export async function changeLiveCopyTx(client: PoolClient, userId: string, productId: string,
  changes: Partial<Record<(typeof COPY_FIELDS)[number], string | null>>) {
  const keys = (Object.keys(changes) as (typeof COPY_FIELDS)[number][]).filter((k) => (COPY_FIELDS as readonly string[]).includes(k));
  const p = (await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [productId])).rows[0];
  if (!p) throw new AppError('Product not found', 404);
  if (p.catalogue_state !== 'live') throw new AppError('Only a product in the catalogue has copy for buyers', 409);
  const changed = keys.filter((k) => (p[k] ?? null) !== (changes[k] ?? null));
  if (!changed.length) return { id: productId, content_status: p.content_status as string, changed: false };
  const after = { ...p, ...changes };
  await client.query(
    `UPDATE products SET ${changed.map((k, i) => `${k} = $${i + 3}`).join(', ')}, content_status = 'pending_review',
            content_flags = $2, updated_at = NOW() WHERE id = $1`,
    [productId, JSON.stringify(copyFlags(after)), ...changed.map((k) => changes[k] ?? null)]);
  await writeAuditTx(client, { userId: null, action: 'product_copy_changed', performedBy: userId,
    oldValue: Object.fromEntries(changed.map((k) => [k, p[k] ?? null])),
    newValue: { product_id: productId, ...Object.fromEntries(changed.map((k) => [k, changes[k] ?? null])) } });
  return { id: productId, content_status: 'pending_review', changed: true };
}

export async function reviewContent(pharmacistId: string, productId: string, approve: boolean, notes: string) {
  return withTransaction((client) => reviewContentTx(client, pharmacistId, productId, approve, notes));
}

/** The one C-19 copy decision, inside the caller's transaction (also used when a draft is approved, Sprint 29). */
export async function reviewContentTx(client: PoolClient, pharmacistId: string, productId: string, approve: boolean, notes: string) {
  const p = (await client.query(
    `SELECT id, content_status, content_flags, catalogue_state FROM products WHERE id = $1 FOR UPDATE`, [productId])).rows[0];
  if (!p) throw new AppError('Product not found', 404);
  if (p.catalogue_state === 'draft') throw new AppError('This is a new product still being completed: approve it from "New products to complete"', 409);
  if (p.content_status !== 'pending_review') throw new AppError(`Product copy is already ${p.content_status}`, 409);
  if (approve && Array.isArray(p.content_flags) && p.content_flags.length && notes.length < 20) {
    throw new AppError('This copy has flagged claims; explain why it is acceptable (at least 20 characters) or reject it', 400);
  }
  const status = approve ? 'approved' : 'rejected';
  await client.query(
    `UPDATE products SET content_status = $2, content_reviewed_by = $3, content_reviewed_at = NOW() WHERE id = $1`,
    [productId, status, pharmacistId]);
  await writeAuditTx(client, { userId: null, action: `product_copy_${status}`, performedBy: pharmacistId,
    newValue: { product_id: productId, flags: p.content_flags }, notes });
  await cacheDel(`product:${productId}`);
  return { id: productId, content_status: status };
}
