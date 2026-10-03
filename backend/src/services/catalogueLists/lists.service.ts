// Sprint 31 — product categories and HSN codes kept on the server (one list each).
// Admins and pharmacists add to them from "New products to complete" or the
// product form (Alt+C / "+ New"); every addition is audited (C-46). A name that
// is already there (any capitals / spaces) or an HSN code already listed is not
// added again: the existing entry is returned and chosen, with a note.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { categoryKey, GST_RATES, HSN_RE, categoryNameProblems, hsnProblems, tidyHsn, tidyName } from './rules';

type Db = Pick<PoolClient, 'query'>;

export interface CategoryRow { id: string; name: string; is_active: boolean; product_count: number; merged_into?: string | null; merged_into_name?: string | null }
export interface HsnRow { code: string; description: string | null; gst_rate: number | null; is_active: boolean; product_count: number; merged_into?: string | null }

/** Columns of a category row for the lists (Sprint 36: where a merged entry went). */
export const CATEGORY_LIST_COLS = `c.id, c.name, c.is_active, c.merged_into,
  (SELECT m.name FROM product_categories m WHERE m.id = c.merged_into) AS merged_into_name,
  (SELECT COUNT(*)::int FROM products p WHERE p.category = c.name AND p.deleted_at IS NULL) AS product_count`;
export const HSN_LIST_COLS = `h.code, h.description, h.gst_rate, h.is_active, h.merged_into,
  (SELECT COUNT(*)::int FROM products p WHERE p.hsn_code = h.code AND p.deleted_at IS NULL) AS product_count`;

export async function listCategories(includeInactive = false): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    `SELECT ${CATEGORY_LIST_COLS}
     FROM product_categories c ${includeInactive ? '' : 'WHERE c.is_active'}
     ORDER BY c.name_key`);
}

export async function listHsnCodes(includeInactive = false): Promise<HsnRow[]> {
  return query<HsnRow>(
    `SELECT ${HSN_LIST_COLS}
     FROM hsn_codes h ${includeInactive ? '' : 'WHERE h.is_active'}
     ORDER BY h.code`);
}

/** Adds a category, or returns the one already there under the same name. */
export async function createCategory(rawName: string, userId: string, mayReactivate = true) {
  const problems = categoryNameProblems(rawName);
  if (problems.length) throw new AppError(problems.join('; '), 400);
  const name = tidyName(rawName);
  return withTransaction(async (c) => {
    const existing = (await c.query<CategoryRow>(
      `SELECT id, name, is_active, merged_into FROM product_categories WHERE name_key = $1 FOR UPDATE`, [categoryKey(name)])).rows[0];
    if (existing?.merged_into) {
      // Merged into another entry by an admin (Sprint 36): that one is chosen
      const target = (await c.query<CategoryRow>('SELECT id, name, is_active FROM product_categories WHERE id = $1', [existing.merged_into])).rows[0];
      return { category: { id: target.id, name: target.name }, created: false,
        note: `"${existing.name}" was merged into "${target.name}", so "${target.name}" was chosen` };
    }
    if (existing) {
      if (!existing.is_active) {
        // Switched off by an admin in Catalogue lists (Sprint 32): only an admin switches it back on
        if (!mayReactivate) throw new AppError(`"${existing.name}" was switched off by an admin. Choose another category, or ask an admin to switch it on in Catalogue lists`, 409);
        await c.query('UPDATE product_categories SET is_active = TRUE WHERE id = $1', [existing.id]);
        await writeAuditTx(c, { userId: null, action: 'product_category_reactivated', performedBy: userId,
          newValue: { category_id: existing.id, name: existing.name } });
      }
      return { category: { id: existing.id, name: existing.name }, created: false,
        note: `"${existing.name}" is already in the list, so it was chosen` };
    }
    const row = (await c.query<{ id: string; name: string }>(
      `INSERT INTO product_categories (name, created_by) VALUES ($1, $2) RETURNING id, name`, [name, userId])).rows[0];
    await writeAuditTx(c, { userId: null, action: 'product_category_created', performedBy: userId,
      newValue: { category_id: row.id, name: row.name } });
    return { category: row, created: true, note: null };
  });
}

/** Adds an HSN code, or returns the one already listed (its description and GST are not changed). */
export async function createHsnCode(input: { code: string; description: string; gst_rate?: number | null }, userId: string, mayReactivate = true) {
  const problems = hsnProblems(input);
  if (problems.length) throw new AppError(problems.join('; '), 400);
  const code = tidyHsn(input.code);
  const description = tidyName(input.description);
  const gst = input.gst_rate ?? null;
  return withTransaction(async (c) => {
    const existing = (await c.query<HsnRow>(
      'SELECT code, description, gst_rate, is_active, merged_into FROM hsn_codes WHERE code = $1 FOR UPDATE', [code])).rows[0];
    if (existing?.merged_into) {
      const row = (await c.query('SELECT code, description, gst_rate FROM hsn_codes WHERE code = $1', [existing.merged_into])).rows[0];
      return { hsn: row as { code: string; description: string | null; gst_rate: number | null }, created: false,
        note: `HSN ${code} was merged into ${existing.merged_into}, so ${existing.merged_into} was chosen` };
    }
    if (existing) {
      if (!existing.is_active && !mayReactivate) {
        throw new AppError(`HSN ${code} was switched off by an admin. Choose another code, or ask an admin to switch it on in Catalogue lists`, 409);
      }
      // A code taken from the catalogue may have no words yet: fill them in, never overwrite
      if (!existing.description || !existing.is_active) {
        await c.query(
          `UPDATE hsn_codes SET description = COALESCE(description, $2), gst_rate = COALESCE(gst_rate, $3), is_active = TRUE WHERE code = $1`,
          [code, description, gst]);
        await writeAuditTx(c, { userId: null, action: 'hsn_code_completed', performedBy: userId,
          oldValue: { code, description: existing.description, gst_rate: existing.gst_rate, is_active: existing.is_active },
          newValue: { code, description: existing.description ?? description, gst_rate: existing.gst_rate ?? gst } });
      }
      const row = (await c.query('SELECT code, description, gst_rate FROM hsn_codes WHERE code = $1', [code])).rows[0];
      return { hsn: row as { code: string; description: string | null; gst_rate: number | null }, created: false,
        note: `HSN ${code} is already in the list, so it was chosen` };
    }
    const row = (await c.query<{ code: string; description: string; gst_rate: number | null }>(
      `INSERT INTO hsn_codes (code, description, gst_rate, created_by) VALUES ($1, $2, $3, $4) RETURNING code, description, gst_rate`,
      [code, description, gst, userId])).rows[0];
    await writeAuditTx(c, { userId: null, action: 'hsn_code_created', performedBy: userId, newValue: row });
    return { hsn: row, created: true, note: null };
  });
}

/** The list's spelling of a category, or a plain 400 when it is not in the list (queue saves). */
export async function requireCategory(db: Db, raw: string | null | undefined): Promise<string | null> {
  if (raw === null || raw === undefined || !raw.trim()) return null;
  const row = (await db.query<{ name: string; is_active: boolean }>(
    `SELECT COALESCE(t.name, c.name) AS name, COALESCE(t.is_active, c.is_active) AS is_active
     FROM product_categories c LEFT JOIN product_categories t ON t.id = c.merged_into WHERE c.name_key = $1`, [categoryKey(raw)])).rows[0];
  if (!row) throw new AppError(`"${tidyName(raw)}" is not in the category list: add it with "+ New" (Alt+C) first`, 400);
  if (!row.is_active) throw new AppError(`The category "${row.name}" is no longer used: choose another`, 400);
  return row.name;
}

/** The HSN code if it is in the list, or a plain 400 (queue saves). */
export async function requireHsn(db: Db, raw: string | null | undefined): Promise<string | null> {
  if (raw === null || raw === undefined || !raw.trim()) return null;
  const typed = tidyHsn(raw);
  const row = (await db.query<{ code: string; is_active: boolean }>(
    `SELECT COALESCE(t.code, h.code) AS code, COALESCE(t.is_active, h.is_active) AS is_active
     FROM hsn_codes h LEFT JOIN hsn_codes t ON t.code = h.merged_into WHERE h.code = $1`, [typed])).rows[0];
  if (!row) throw new AppError(`HSN ${typed} is not in the HSN list: add it with "+ New" (Alt+C) first`, 400);
  if (!row.is_active) throw new AppError(`HSN ${row.code} is no longer used: choose another`, 400);
  return row.code;   // a merged code is replaced by the one it was merged into (Sprint 36)
}

/**
 * Admin product form / API: the list's spelling of the category; a name not in the
 * list is added (admins may add categories) with an audit entry. Same for a valid
 * HSN code. Returns the values to store.
 */
export async function registerFromProductForm(db: Db, userId: string, v: { category?: string | null; hsn_code?: string | null; gst_rate?: number | null },
  current: { category?: string | null; hsn_code?: string | null } = {}) {
  const out: { category?: string | null; hsn_code?: string | null } = {};
  if (v.category !== undefined && v.category !== null && v.category.trim()) {
    const name = tidyName(v.category);
    // A merged entry stands for the one it was merged into (Sprint 36)
    const found = (await db.query<{ name: string; is_active: boolean }>(
      `SELECT COALESCE(t.name, c.name) AS name, COALESCE(t.is_active, c.is_active) AS is_active
       FROM product_categories c LEFT JOIN product_categories t ON t.id = c.merged_into WHERE c.name_key = $1`, [categoryKey(name)])).rows[0];
    // A switched-off entry stays on products that have it, but is not chosen anew (Sprint 32)
    if (found && !found.is_active && categoryKey(current.category ?? '') !== categoryKey(name)) {
      throw new AppError(`The category "${found.name}" is no longer used: choose another`, 400);
    }
    if (found) out.category = found.name;
    else {
      const problems = categoryNameProblems(name);
      if (problems.length) throw new AppError(problems.join('; '), 400);
      const row = (await db.query<{ id: string; name: string }>(
        `INSERT INTO product_categories (name, created_by) VALUES ($1, $2)
         ON CONFLICT (name_key) DO UPDATE SET name = product_categories.name RETURNING id, name`, [name, userId])).rows[0];
      await writeAuditTx(db as PoolClient, { userId: null, action: 'product_category_created', performedBy: userId,
        newValue: { category_id: row.id, name: row.name, source: 'product form' } });
      out.category = row.name;
    }
  }
  if (v.hsn_code !== undefined && v.hsn_code !== null && v.hsn_code.trim()) {
    const typed = tidyHsn(v.hsn_code);
    const merged = (await db.query<{ merged_into: string | null }>('SELECT merged_into FROM hsn_codes WHERE code = $1', [typed])).rows[0]?.merged_into;
    const code = merged ?? typed;   // a merged code stands for its target (Sprint 36)
    out.hsn_code = code;
    const listed = (await db.query<{ is_active: boolean }>('SELECT is_active FROM hsn_codes WHERE code = $1', [code])).rows[0];
    if (listed && !listed.is_active && tidyHsn(current.hsn_code ?? '') !== code) {
      throw new AppError(`HSN ${code} is no longer used: choose another`, 400);
    }
    if (!listed && HSN_RE.test(code)) {
      const gst = v.gst_rate != null && (GST_RATES as readonly number[]).includes(v.gst_rate) ? v.gst_rate : null;
      await db.query('INSERT INTO hsn_codes (code, gst_rate, created_by) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING', [code, gst, userId]);
      await writeAuditTx(db as PoolClient, { userId: null, action: 'hsn_code_created', performedBy: userId,
        newValue: { code, gst_rate: gst, source: 'product form' } });
    }
  }
  return out;
}
