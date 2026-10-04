// Setting who may buy a product (Sprint 47, rules.ts). Only a Dawabag pharmacist with a
// valid registration (Sprint 39 gate), with a reason; the database logs every change
// (product_buyer_restriction_log, append-only) and refuses a change without who / why
// (migration 42); each change is audited too (C-46). Buyers' queries read the column live,
// so a restriction applies at once on every path — Dawabag's stock and every partner's.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { cacheDel } from '../../config/redis';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { assertStaffRegistrationValid } from '../pharmacistRegistration/gate.service';
import { RestrictionInput, restrictionInputProblems } from './rules';

export interface Actor { id: string; role: string }

/** Inside the caller's transaction (also the new-product completion form, Sprint 29 / 46). */
export async function setBuyerRestrictionTx(c: PoolClient, actor: Actor, productId: string, input: RestrictionInput) {
  const p = (await c.query(
    `SELECT id, name, sku, buyer_restriction FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [productId])).rows[0];
  if (!p) throw new AppError('Product not found', 404);
  const problems = restrictionInputProblems(input, actor.role, p.buyer_restriction);
  if (problems.length) throw new AppError(problems.join('; '), problems[0].startsWith('Only a Dawabag pharmacist') ? 403 : 400);
  const u = (await c.query(`SELECT pharmacist_reg_no FROM users WHERE id = $1`, [actor.id])).rows[0];
  if (!u?.pharmacist_reg_no) throw new AppError('Add your pharmacy council registration number before deciding who may buy a product', 403);
  await assertStaffRegistrationValid(c, actor.id, u.pharmacist_reg_no);
  const reason = String(input.reason).trim();
  await c.query(
    `UPDATE products SET buyer_restriction = $2, buyer_restriction_reason = $3, buyer_restriction_set_by = $4,
       buyer_restriction_set_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [productId, input.restriction, reason, actor.id]);
  await writeAuditTx(c, { userId: null, action: 'product_buyer_restriction_set', performedBy: actor.id,
    oldValue: { product_id: productId, sku: p.sku, buyer_restriction: p.buyer_restriction },
    newValue: { product_id: productId, sku: p.sku, buyer_restriction: input.restriction }, notes: reason });
  return { id: productId, name: p.name as string, buyer_restriction: input.restriction, previous: p.buyer_restriction as string };
}

export async function setBuyerRestriction(actor: Actor, productId: string, input: RestrictionInput) {
  const r = await withTransaction((c) => setBuyerRestrictionTx(c, actor, productId, input));
  await cacheDel(`product:${productId}`);
  return r;
}

/** The product's append-only history, newest first (admins and pharmacists). */
export async function buyerRestrictionLog(productId: string) {
  return query<any>(
    `SELECT l.old_restriction, l.new_restriction, l.reason, l.set_at, up.full_name AS set_by_name
     FROM product_buyer_restriction_log l LEFT JOIN user_profiles up ON up.user_id = l.set_by
     WHERE l.product_id = $1 ORDER BY l.set_at DESC, l.id DESC LIMIT 100`, [productId]);
}

/** Products with a restriction (staff overview). */
export async function restrictedProducts() {
  return query<any>(
    `SELECT p.id, p.name, p.sku, p.buyer_restriction, p.buyer_restriction_reason, p.buyer_restriction_set_at,
            up.full_name AS buyer_restriction_set_by_name
     FROM products p LEFT JOIN user_profiles up ON up.user_id = p.buyer_restriction_set_by
     WHERE p.deleted_at IS NULL AND p.buyer_restriction <> 'everyone' ORDER BY p.name LIMIT 500`);
}
