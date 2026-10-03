// Sprint 32 — Admin → Catalogue lists: rename, correct and switch off entries of the
// category and HSN lists (Sprint 31 built adding only). Admins only; pharmacists see
// the lists read-only. Every change is audited with before / after (C-46).
//   - Renaming a category renames it on every product that uses it, in the same
//     transaction (the shop filters by the category name).
//   - An HSN code used by any product keeps its number (products and their invoices
//     carry it); its description and usual GST rate can change. An unused code can be
//     corrected. The GST rate here is a hint only: no product's GST is changed.
//   - Switching an entry off removes it from the pick-lists; products that already use
//     it keep it (requireCategory / requireHsn refuse it for new choices).
import { query, withTransaction } from '../../config/database';
import { cacheDel } from '../../config/redis';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { CATEGORY_LIST_COLS, HSN_LIST_COLS } from './lists.service';
import { categoryRenameProblems, HsnEdit, hsnEditProblems, tidyHsn, tidyName } from './rules';

const CATEGORY_KEY_SQL = `lower(regexp_replace(btrim(p.category), '\\s+', ' ', 'g'))`;

export async function updateCategory(id: string, edit: { name?: string; is_active?: boolean }, userId: string) {
  if (edit.name === undefined && edit.is_active === undefined) throw new AppError('Nothing to change', 400);
  const result = await withTransaction(async (c) => {
    const cur = (await c.query<{ id: string; name: string; name_key: string; is_active: boolean; merged_into: string | null }>(
      'SELECT id, name, name_key, is_active, merged_into FROM product_categories WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw new AppError('Category not found', 404);
    // Sprint 36: a merged entry is kept only so old spellings find the target
    if (cur.merged_into) throw new AppError(`"${cur.name}" was merged into another category and cannot be changed`, 409);
    let productIds: string[] = [];
    let name = cur.name;
    if (edit.name !== undefined && tidyName(edit.name) !== cur.name) {
      const others = (await c.query<{ name: string }>('SELECT name FROM product_categories WHERE id <> $1', [id])).rows;
      const problems = categoryRenameProblems(cur, edit.name, others);
      if (problems.length) throw new AppError(problems.join('; '), problems[0].includes('already in the list') ? 409 : 400);
      name = tidyName(edit.name);
      await c.query('UPDATE product_categories SET name = $2 WHERE id = $1', [id, name]);
      // Every product under the old name (any spelling of it), drafts and removed ones included
      // Same entry, new spelling: the products trigger lets this through even when the
      // entry is switched off (it refuses only a NEW choice of a switched-off entry, Sprint 34)
      await c.query(`SELECT set_config('dawabag.catalogue_list_rename', 'on', true)`);
      productIds = (await c.query<{ id: string }>(
        `UPDATE products p SET category = $2, updated_at = NOW() WHERE ${CATEGORY_KEY_SQL} = $1 RETURNING p.id`,
        [cur.name_key, name])).rows.map((r) => r.id);
      await c.query(`SELECT set_config('dawabag.catalogue_list_rename', 'off', true)`);
      await writeAuditTx(c, { userId: null, action: 'product_category_renamed', performedBy: userId,
        oldValue: { category_id: id, name: cur.name },
        newValue: { category_id: id, name, products_updated: productIds.length } });
    }
    if (edit.is_active !== undefined && edit.is_active !== cur.is_active) {
      await c.query('UPDATE product_categories SET is_active = $2 WHERE id = $1', [id, edit.is_active]);
      await writeAuditTx(c, { userId: null, action: edit.is_active ? 'product_category_reactivated' : 'product_category_deactivated',
        performedBy: userId, oldValue: { category_id: id, name, is_active: cur.is_active }, newValue: { category_id: id, name, is_active: edit.is_active } });
    }
    const row = (await c.query(`SELECT ${CATEGORY_LIST_COLS} FROM product_categories c WHERE c.id = $1`, [id])).rows[0];
    return { category: row, products_updated: productIds.length, productIds };
  });
  // The product page caches the product row for a few minutes
  await Promise.all(result.productIds.map((pid) => cacheDel(`product:${pid}`).catch(() => undefined)));
  return { category: result.category, products_updated: result.products_updated };
}

export async function updateHsnCode(code: string, edit: HsnEdit & { is_active?: boolean }, userId: string) {
  const keys = ['code', 'description', 'gst_rate', 'is_active'] as const;
  if (!keys.some((k) => edit[k] !== undefined)) throw new AppError('Nothing to change', 400);
  return withTransaction(async (c) => {
    const found = (await c.query<{ code: string; description: string | null; gst_rate: number | null; is_active: boolean; merged_into: string | null }>(
      'SELECT code, description, gst_rate, is_active, merged_into FROM hsn_codes WHERE code = $1 FOR UPDATE', [tidyHsn(code)])).rows[0];
    if (!found) throw new AppError('HSN code not found', 404);
    if (found.merged_into) throw new AppError(`HSN ${found.code} was merged into ${found.merged_into} and cannot be changed`, 409);
    const { merged_into: _merged, ...cur } = found;
    // Any product row, removed ones too: their invoices carry the code
    const usedBy = Number((await c.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM products WHERE hsn_code = $1', [cur.code])).rows[0].n);
    const newCode = edit.code === undefined ? cur.code : tidyHsn(edit.code);
    const taken = newCode !== cur.code && !!(await c.query('SELECT 1 FROM hsn_codes WHERE code = $1', [newCode])).rows[0];
    const problems = hsnEditProblems(cur, edit, usedBy, taken);
    if (problems.length) throw new AppError(problems.join('; '), usedBy > 0 && newCode !== cur.code ? 409 : taken ? 409 : 400);

    const next = {
      code: newCode,
      description: edit.description === undefined ? cur.description : tidyName(edit.description ?? ''),
      gst_rate: edit.gst_rate === undefined ? cur.gst_rate : edit.gst_rate,
      is_active: edit.is_active === undefined ? cur.is_active : edit.is_active,
    };
    await c.query('UPDATE hsn_codes SET code = $2, description = $3, gst_rate = $4, is_active = $5 WHERE code = $1',
      [cur.code, next.code, next.description, next.gst_rate, next.is_active]);
    const action = next.is_active !== cur.is_active && next.code === cur.code && next.description === cur.description && next.gst_rate === cur.gst_rate
      ? (next.is_active ? 'hsn_code_reactivated' : 'hsn_code_deactivated') : 'hsn_code_changed';
    await writeAuditTx(c, { userId: null, action, performedBy: userId, oldValue: cur, newValue: next });
    const row = (await c.query(`SELECT ${HSN_LIST_COLS} FROM hsn_codes h WHERE h.code = $1`, [next.code])).rows[0];
    return { hsn: row };
  });
}

/** Search for the management page: name, or code / description, contains the words; inactive entries included. */
export async function searchLists(kind: 'categories' | 'hsn', q: string) {
  const esc = (t: string) => `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const words = tidyName(q).toLowerCase();
  if (kind === 'categories') {
    return query(
      `SELECT ${CATEGORY_LIST_COLS}
       FROM product_categories c WHERE c.name_key LIKE $1 ORDER BY c.is_active DESC, c.name_key`, [esc(words)]);
  }
  return query(
    `SELECT ${HSN_LIST_COLS}
     FROM hsn_codes h WHERE h.code LIKE $2 OR lower(COALESCE(h.description, '')) LIKE $1 ORDER BY h.is_active DESC, h.code`,
    [esc(words), esc(tidyHsn(words))]);
}
