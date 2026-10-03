// Sprint 36 — Admin → Catalogue lists: merge a duplicate entry into another.
//   Category: every product under the source (any spelling; drafts, not-listed and
//   removed ones too — drafts ARE product rows, Sprint 29) moves to the target in
//   the same transaction. Product categories are referenced only by name from
//   products.category (no other table stores a category). The source stays in the
//   list switched off with merged_into → target, so a catalogue file or form that
//   still names the old spelling lands in the target (database trigger, migration 31)
//   instead of re-creating the duplicate. Entries merged into the source earlier are
//   re-pointed to the target (one hop only).
//   HSN code: the same, but only while no product under the source code has been
//   sold — invoices, credit notes, e-invoices and the HSN summary read the product's
//   current HSN code, so moving sold products would change past tax documents (C-30,
//   C-31). Two codes with different usual GST rates are different tax classes, not
//   duplicates, and are refused. A reason is required (tax classification).
// Admins only. Audited with before / after and the number of products moved (C-46).
import { PoolClient } from 'pg';
import { withTransaction } from '../../config/database';
import { cacheDel } from '../../config/redis';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { hsnGstClash, hsnMergeBlock, mergeProblems, tidyHsn } from './rules';

interface CategoryLock { id: string; name: string; name_key: string; is_active: boolean; merged_into: string | null }
interface HsnLock { code: string; description: string | null; gst_rate: number | null; is_active: boolean; merged_into: string | null }

const statusOf = (problems: string[]) => (/not found/.test(problems[0]) ? 404 : /itself/.test(problems[0]) ? 400 : 409);

/** Locks both rows in a fixed order (by key), so two merges at once cannot deadlock. */
async function lockCategories(c: PoolClient, ids: string[]) {
  const rows = (await c.query<CategoryLock>(
    `SELECT id, name, name_key, is_active, merged_into FROM product_categories WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids])).rows;
  return new Map(rows.map((r) => [r.id, r]));
}

export async function mergeCategory(sourceId: string, targetId: string, userId: string, reason: string | null) {
  const result = await withTransaction(async (c) => {
    const rows = await lockCategories(c, [sourceId, targetId]);
    const src = rows.get(sourceId);
    const dst = rows.get(targetId);
    const entry = (r?: CategoryLock) => r && { key: r.id, label: `"${r.name}"`, is_active: r.is_active, merged: !!r.merged_into };
    const problems = mergeProblems(entry(src), entry(dst), 'category');
    if (problems.length) throw new AppError(problems.join('; '), statusOf(problems));

    // Every product under the source's name (any capitals / spaces), whatever its state
    const productIds = (await c.query<{ id: string }>(
      `UPDATE products p SET category = $2, updated_at = NOW()
       WHERE lower(regexp_replace(btrim(p.category), '\\s+', ' ', 'g')) = $1 RETURNING p.id`,
      [src!.name_key, dst!.name])).rows.map((r) => r.id);
    // Entries merged into the source before now point at the target (one hop)
    const repointed = (await c.query(
      'UPDATE product_categories SET merged_into = $2 WHERE merged_into = $1 RETURNING id', [sourceId, targetId])).rowCount ?? 0;
    await c.query(
      `UPDATE product_categories SET is_active = FALSE, merged_into = $2, merged_at = NOW(), merged_by = $3 WHERE id = $1`,
      [sourceId, targetId, userId]);
    await writeAuditTx(c, { userId: null, action: 'product_category_merged', performedBy: userId,
      oldValue: { category_id: sourceId, name: src!.name, is_active: src!.is_active },
      newValue: { category_id: sourceId, merged_into: targetId, into_name: dst!.name, products_moved: productIds.length, entries_repointed: repointed },
      notes: reason });
    return { productIds, source: { id: sourceId, name: src!.name }, target: { id: targetId, name: dst!.name }, repointed };
  });
  // The shop's category list and the product pages are cached for a while
  await Promise.all([cacheDel('categories'), ...result.productIds.map((pid) => cacheDel(`product:${pid}`))].map((p) => p.catch(() => undefined)));
  return { source: result.source, target: result.target, products_moved: result.productIds.length, entries_repointed: result.repointed };
}

export async function mergeHsnCode(sourceRaw: string, targetRaw: string, userId: string, reason: string) {
  const source = tidyHsn(sourceRaw);
  const target = tidyHsn(targetRaw);
  const result = await withTransaction(async (c) => {
    const rows = new Map((await c.query<HsnLock>(
      `SELECT code, description, gst_rate, is_active, merged_into FROM hsn_codes WHERE code = ANY($1::text[]) ORDER BY code FOR UPDATE`,
      [[source, target]])).rows.map((r) => [r.code, r]));
    const src = rows.get(source);
    const dst = rows.get(target);
    const entry = (r?: HsnLock) => r && { key: r.code, label: `HSN ${r.code}`, is_active: r.is_active, merged: !!r.merged_into };
    const problems = mergeProblems(entry(src), entry(dst), 'HSN code');
    if (problems.length) throw new AppError(problems.join('; '), statusOf(problems));
    const clash = hsnGstClash(src!, dst!);
    if (clash) throw new AppError(clash, 409);
    // Any sold line of a product under the source code, removed products included
    const sold = Number((await c.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE p.hsn_code = $1`, [source])).rows[0].n);
    const block = hsnMergeBlock(source, sold);
    if (block) throw new AppError(block, 409);

    const productIds = (await c.query<{ id: string }>(
      `UPDATE products SET hsn_code = $2, updated_at = NOW() WHERE hsn_code = $1 RETURNING id`, [source, target])).rows.map((r) => r.id);
    const repointed = (await c.query('UPDATE hsn_codes SET merged_into = $2 WHERE merged_into = $1 RETURNING code', [source, target])).rowCount ?? 0;
    await c.query(`UPDATE hsn_codes SET is_active = FALSE, merged_into = $2, merged_at = NOW(), merged_by = $3 WHERE code = $1`,
      [source, target, userId]);
    await writeAuditTx(c, { userId: null, action: 'hsn_code_merged', performedBy: userId,
      oldValue: { code: source, description: src!.description, gst_rate: src!.gst_rate, is_active: src!.is_active },
      newValue: { code: source, merged_into: target, products_moved: productIds.length, entries_repointed: repointed },
      notes: reason });
    return { productIds, repointed };
  });
  await Promise.all(result.productIds.map((pid) => cacheDel(`product:${pid}`).catch(() => undefined)));
  return { source: { code: source }, target: { code: target }, products_moved: result.productIds.length, entries_repointed: result.repointed };
}
