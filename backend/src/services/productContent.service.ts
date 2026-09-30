// src/services/productContent.service.ts — pharmacist review of product copy (Rulebook C-19)
// Any change to name, description, composition or storage text sends the
// product back for review; the public page hides the description until then.
import { query, withTransaction } from '../config/database';
import { cacheDel } from '../config/redis';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { findRestrictedClaims } from '../utils/claimsCheck';

export const COPY_FIELDS = ['name', 'description', 'composition', 'storage_instructions'] as const;

export function copyFlags(p: Record<string, any>) {
  return findRestrictedClaims(p.name, p.description, p.composition, p.storage_instructions);
}

export async function contentQueue() {
  return query(
    `SELECT id, sku, name, drug_schedule, description, composition, storage_instructions, content_status,
            content_flags, updated_at
     FROM products WHERE content_status = 'pending_review' AND deleted_at IS NULL
     ORDER BY updated_at LIMIT 200`);
}

export async function reviewContent(pharmacistId: string, productId: string, approve: boolean, notes: string) {
  return withTransaction(async (client) => {
    const p = (await client.query(
      `SELECT id, content_status, content_flags FROM products WHERE id = $1 FOR UPDATE`, [productId])).rows[0];
    if (!p) throw new AppError('Product not found', 404);
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
  });
}
