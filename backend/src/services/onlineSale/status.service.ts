// Setting a product's online-sale status (Sprint 39, rules.ts): one product or many
// in one transaction, each change logged by the database (product_online_status_log)
// and audited (C-46). Allowing (permitted) needs a pharmacist with a valid registration
// and a dated reference. A product switched off stops selling at once everywhere —
// Dawabag's stock and every partner's — because buyers' queries read the status live;
// partners holding a listing are told.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { cacheDel } from '../../config/redis';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { todayIST } from '../../utils/ist';
import { queueNotification } from '../notification.service';
import { assertStaffRegistrationValid } from '../pharmacistRegistration/gate.service';
import { OnlineSaleStatus, StatusInput, scheduleProblem, statusInputProblems } from './rules';
import { classOnlineProblem } from '../productClass/rules';

export const MAX_BULK = 500;

export interface Actor { id: string; role: string }

/** Inside the caller's transaction (also the draft approval form, Sprint 29 + 39). */
export async function setOnlineStatusTx(c: PoolClient, actor: Actor, productIds: string[], input: StatusInput) {
  const problems = statusInputProblems(input, actor.role, todayIST());
  if (problems.length) throw new AppError(problems.join('; '), 400);
  if (!productIds.length) throw new AppError('Choose at least one product', 400);
  if (productIds.length > MAX_BULK) throw new AppError(`Choose up to ${MAX_BULK} products at a time`, 400);
  if (input.status === 'permitted') {
    const u = (await c.query(`SELECT pharmacist_reg_no FROM users WHERE id = $1`, [actor.id])).rows[0];
    if (!u?.pharmacist_reg_no) throw new AppError('Add your pharmacy council registration number before allowing products for online sale', 403);
    await assertStaffRegistrationValid(c, actor.id, u.pharmacist_reg_no);
  }
  const rows = (await c.query(
    `SELECT id, name, sku, drug_schedule, online_sale_status, catalogue_state, product_class, is_new_drug FROM products
     WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE`, [productIds])).rows;
  if (rows.length !== new Set(productIds).size) throw new AppError('Some products were not found', 404);
  // Sprint 40: devices never; a new drug only with the pharmacist's confirmation (C-10)
  const bad = rows.map((r: any) => scheduleProblem(input.status, r.drug_schedule, r.name)
    ?? classOnlineProblem(r, input.status, input.new_drug_confirmation)).filter(Boolean) as string[];
  if (bad.length) throw new AppError(bad.slice(0, 10).join('; '), 400);
  const ref = input.notification_ref?.trim() || null;
  const reason = input.reason?.trim() || null;
  const confirmation = input.status === 'permitted' ? input.new_drug_confirmation?.trim() || null : null;
  await c.query(
    `UPDATE products SET online_sale_status = $2, online_sale_ref = $3, online_sale_ref_date = $4, online_sale_reason = $5,
       online_sale_set_by = $6, online_sale_set_at = NOW(), updated_at = NOW(),
       new_drug_confirmation = CASE WHEN is_new_drug AND $7::text IS NOT NULL THEN $7 ELSE new_drug_confirmation END,
       new_drug_confirmed_by = CASE WHEN is_new_drug AND $7::text IS NOT NULL THEN $6 ELSE new_drug_confirmed_by END,
       new_drug_confirmed_at = CASE WHEN is_new_drug AND $7::text IS NOT NULL THEN NOW() ELSE new_drug_confirmed_at END
     WHERE id = ANY($1::uuid[])`,
    [productIds, input.status, ref, input.notification_date || null, reason, actor.id, confirmation]);
  const switchedOff = rows.filter((r: any) => r.online_sale_status === 'permitted' && input.status !== 'permitted');
  await writeAuditTx(c, { userId: null, action: 'product_online_status_set', performedBy: actor.id,
    oldValue: { statuses: rows.map((r: any) => [r.sku, r.online_sale_status]) },
    newValue: { product_ids: productIds, status: input.status, notification_ref: ref, notification_date: input.notification_date || null, reason,
      new_drug_confirmation: rows.some((r: any) => r.is_new_drug) ? confirmation : undefined } });
  return { updated: rows.length, status: input.status, switched_off: switchedOff.map((r: any) => ({ id: r.id, name: r.name })) };
}

/** Partners holding a listing of a product that stopped selling online are told (owner logins). */
async function tellPartners(switchedOff: { id: string; name: string }[], input: StatusInput) {
  for (const p of switchedOff) {
    const owners = await query<{ user_id: string }>(
      `SELECT DISTINCT vu.user_id FROM partner_products pp JOIN vendor_users vu ON vu.vendor_id = pp.partner_id JOIN users u ON u.id = vu.user_id
       WHERE pp.product_id = $1 AND vu.is_owner AND u.is_active`, [p.id]);
    const text = `${p.name} is ${input.status === 'prohibited' ? 'prohibited' : 'not allowed'} for online sale from now on`
      + `${input.notification_ref ? ` (${input.notification_ref.trim()})` : ''}. Dawabag will not sell it from your stock until it is allowed again.`;
    for (const o of owners) await queueNotification({ userId: o.user_id, type: 'online_sale_status_changed', productName: p.name, text });
  }
}

export async function setOnlineStatus(actor: Actor, productIds: string[], input: StatusInput) {
  const r = await withTransaction((c) => setOnlineStatusTx(c, actor, [...new Set(productIds)], input));
  for (const id of productIds) await cacheDel(`product:${id}`);
  await cacheDel('categories');
  await tellPartners(r.switched_off, input);
  return r;
}

export interface ListFilter { status?: OnlineSaleStatus; q?: string; limit?: number }

/** The staff list: products with their status, newest decisions first within a status. */
export async function listOnlineStatus(f: ListFilter) {
  const params: unknown[] = [];
  const where = ['p.deleted_at IS NULL', `p.catalogue_state IN ('live', 'not_listed')`];
  if (f.status) { params.push(f.status); where.push(`p.online_sale_status = $${params.length}`); }
  if (f.q?.trim()) { params.push(`%${f.q.trim()}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`); }
  params.push(Math.min(Math.max(f.limit ?? 200, 1), 500));
  return query<any>(
    `SELECT p.id, p.name, p.sku, p.drug_schedule, p.is_active, p.catalogue_state, p.online_sale_status, p.online_sale_ref,
            p.product_class, p.is_new_drug, p.new_drug_confirmation,
            to_char(p.online_sale_ref_date, 'YYYY-MM-DD') AS online_sale_ref_date, p.online_sale_reason, p.online_sale_set_at,
            up.full_name AS online_sale_set_by_name
     FROM products p LEFT JOIN user_profiles up ON up.user_id = p.online_sale_set_by
     WHERE ${where.join(' AND ')}
     ORDER BY (p.online_sale_status = 'restricted') DESC, p.online_sale_set_at DESC NULLS LAST, p.name LIMIT $${params.length}`, params);
}

export async function onlineStatusCounts() {
  return query<{ online_sale_status: string; n: number }>(
    `SELECT online_sale_status, COUNT(*)::int AS n FROM products WHERE deleted_at IS NULL AND catalogue_state IN ('live', 'not_listed')
     GROUP BY online_sale_status`);
}

export async function onlineStatusLog(productId: string) {
  return query<any>(
    `SELECT l.old_status, l.new_status, l.notification_ref, to_char(l.notification_date, 'YYYY-MM-DD') AS notification_date, l.reason,
            l.set_at, l.drug_schedule, l.new_drug_confirmation, up.full_name AS set_by_name
     FROM product_online_status_log l LEFT JOIN user_profiles up ON up.user_id = l.set_by
     WHERE l.product_id = $1 ORDER BY l.set_at DESC LIMIT 100`, [productId]);
}
