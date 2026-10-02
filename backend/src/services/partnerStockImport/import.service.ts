// Partner stock import: upload (parsed in memory, rows kept in PostgreSQL), column
// choices, preview, linking a line to a catalogue product, new-product requests and
// cancel. Apply lives in apply.service.ts. A partner sees only its own imports;
// admins see all (partnerId = null).
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import {
  detectPreset, FIELD_KEYS, FIELDS, Mapping, mappingFromNames, mappingToNames, missingRequired, suggestMapping,
} from './fields';
import { evaluateImport, ImportSummary, RowStatus } from './evaluate';
import { locateTable, readStockFile } from './readFile';
import { NEVER_ONLINE } from './validate';

/** A stock file is a snapshot: after this it must be uploaded again before applying. */
export const DRAFT_VALID_HOURS = 24;

export interface UploadedFile { buffer: Buffer; originalname: string; size: number }

export async function loadImport(id: string, partnerId: string | null) {
  const imp = await queryOne<any>(
    `SELECT i.*, v.name AS partner_name FROM partner_stock_imports i JOIN vendors v ON v.id = i.partner_id
     WHERE i.id = $1 AND ($2::uuid IS NULL OR i.partner_id = $2)`, [id, partnerId]);
  if (!imp) throw new AppError('Import not found', 404);
  return imp;
}

export function assertDraft(imp: { status: string; applied_at?: string | Date | null }) {
  if (imp.status === 'applied') throw new AppError('This import has already been applied; upload a new file to update stock again', 409);
  if (imp.status === 'cancelled') throw new AppError('This import was cancelled; upload the file again', 409);
}

export async function createImport(partnerId: string, userId: string, file: UploadedFile) {
  const sheet = await readStockFile(file.buffer);
  const table = locateTable(sheet.rows);
  const preset = detectPreset(table.headers, table.otherText);
  const saved = await queryOne<{ mapping: Record<string, string> }>('SELECT mapping FROM partner_import_mappings WHERE partner_id = $1', [partnerId]);
  const fromSaved = saved ? mappingFromNames(table.headers, saved.mapping) : null;
  let mapping: Mapping;
  let source: 'saved' | 'preset' | 'suggested';
  if (fromSaved && !missingRequired(fromSaved).length) { mapping = fromSaved; source = 'saved'; }
  else if (preset) { mapping = mappingFromNames(table.headers, preset.mapping)!; source = 'preset'; }
  else { mapping = suggestMapping(table.headers); source = 'suggested'; }
  const software = preset?.label ?? null;
  const sha = crypto.createHash('sha256').update(file.buffer).digest('hex');

  return withTransaction(async (c) => {
    const imp = (await c.query<{ id: string }>(
      `INSERT INTO partner_stock_imports (partner_id, file_name, file_size, file_sha256, file_kind, sheet_name, source_software,
         header_row, headers, mapping, mapping_source, row_count, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [partnerId, file.originalname.slice(0, 255), file.size, sha, sheet.kind, sheet.sheetName?.slice(0, 100) ?? null, software,
       table.headerRow, JSON.stringify(table.headers), JSON.stringify(mapping), source, table.rows.length, userId])).rows[0];
    await c.query(
      `INSERT INTO partner_stock_import_rows (import_id, row_number, raw)
       SELECT $1, x.n, x.cells FROM jsonb_to_recordset($2::jsonb) AS x(n int, cells jsonb)`,
      [imp.id, JSON.stringify(table.rows.map((r) => ({ n: r.rowNumber, cells: r.cells })))]);
    const summary = await evaluateImport(c, imp.id, partnerId);
    // C-46: who uploaded which file (by hash) for which partner
    await writeAuditTx(c, { userId, action: 'partner_stock_import_uploaded', performedBy: userId,
      newValue: { vendor_id: partnerId, import_id: imp.id, file_name: file.originalname, sha256: sha, rows: table.rows.length, software } });
    return { id: imp.id, summary };
  });
}

/** Up to three sample values per column, from stock lines, for the column chooser. */
async function columnSamples(importId: string, width: number) {
  const rows = await query<{ raw: string[] }>(
    `SELECT raw FROM partner_stock_import_rows WHERE import_id = $1 AND status <> 'skipped' ORDER BY row_number LIMIT 30`, [importId]);
  return Array.from({ length: width }, (_, col) => {
    const seen: string[] = [];
    for (const r of rows) {
      const v = String(r.raw[col] ?? '').trim();
      if (v && !seen.includes(v)) seen.push(v);
      if (seen.length === 3) break;
    }
    return seen;
  });
}

export async function getImport(id: string, partnerId: string | null) {
  const imp = await loadImport(id, partnerId);
  const sameFile = await queryOne<{ id: string; applied_at: string }>(
    `SELECT id, applied_at FROM partner_stock_imports
     WHERE partner_id = $1 AND file_sha256 = $2 AND status = 'applied' AND id <> $3 ORDER BY applied_at DESC LIMIT 1`,
    [imp.partner_id, imp.file_sha256, imp.id]);
  const expiresAt = new Date(new Date(imp.created_at).getTime() + DRAFT_VALID_HOURS * 3_600_000);
  return {
    id: imp.id, partner_id: imp.partner_id, partner_name: imp.partner_name, file_name: imp.file_name, file_kind: imp.file_kind,
    sheet_name: imp.sheet_name, source_software: imp.source_software, status: imp.status,
    created_at: imp.created_at, applied_at: imp.applied_at, cancelled_at: imp.cancelled_at,
    expires_at: imp.status === 'draft' ? expiresAt : null, expired: imp.status === 'draft' && expiresAt < new Date(),
    header_row: imp.header_row, headers: imp.headers, mapping: imp.mapping, mapping_source: imp.mapping_source,
    mapping_confirmed: !!imp.mapping_confirmed_at, missing_fields: missingRequired(imp.mapping),
    column_samples: await columnSamples(imp.id, imp.headers.length),
    fields: FIELDS.map(({ key, label, required, hint }) => ({ key, label, required, hint })),
    row_count: imp.row_count, summary: imp.summary as ImportSummary | null, result: imp.result,
    same_file_applied_at: sameFile?.applied_at ?? null,
  };
}

export async function listImports(partnerId: string | null, limit = 50) {
  return query(
    `SELECT i.id, i.partner_id, v.name AS partner_name, i.file_name, i.source_software, i.status, i.row_count, i.summary, i.result,
            i.created_at, i.applied_at, i.cancelled_at, up.full_name AS uploaded_by
     FROM partner_stock_imports i JOIN vendors v ON v.id = i.partner_id LEFT JOIN user_profiles up ON up.user_id = i.created_by
     WHERE ($1::uuid IS NULL OR i.partner_id = $1)
     ORDER BY i.created_at DESC LIMIT $2`, [partnerId, limit]);
}

export const ROW_TABS = ['matched', 'needs_review', 'problem', 'skipped'] as const;

export async function listRows(id: string, partnerId: string | null, opts: { status?: RowStatus; page: number; limit: number }) {
  await loadImport(id, partnerId);
  const where = `r.import_id = $1 AND ($2::text IS NULL OR r.status = $2)`;
  const [rows, total] = await Promise.all([
    query(
      `SELECT r.id, r.row_number, r.status, r.parsed, r.item_key, r.product_id, r.match_method, r.problems, r.warnings, r.candidates,
              r.new_product_requested, p.name AS product_name, p.net_quantity AS product_pack, p.drug_schedule AS product_schedule,
              p.cold_chain AS product_cold_chain,
              EXISTS (SELECT 1 FROM partner_products pp JOIN partner_stock_imports i ON i.id = r.import_id
                      WHERE pp.partner_id = i.partner_id AND pp.product_id = r.product_id) AS listed
       FROM partner_stock_import_rows r LEFT JOIN products p ON p.id = r.product_id
       WHERE ${where} ORDER BY r.row_number LIMIT $3 OFFSET $4`,
      [id, opts.status ?? null, opts.limit, (opts.page - 1) * opts.limit]),
    queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM partner_stock_import_rows r WHERE ${where}`, [id, opts.status ?? null]),
  ]);
  return { rows, total: total?.n ?? 0, page: opts.page, limit: opts.limit };
}

/** The partner confirms (or changes) which column holds each detail; remembered for next time. */
export async function setMapping(id: string, partnerId: string, userId: string, mapping: Mapping) {
  const imp = await loadImport(id, partnerId);
  assertDraft(imp);
  const width = imp.headers.length;
  const clean: Mapping = {};
  const used = new Set<number>();
  for (const f of FIELD_KEYS) {
    const col = mapping[f];
    if (col === null || col === undefined) { clean[f] = null; continue; }
    if (!Number.isInteger(col) || col < 0 || col >= width) throw new AppError(`Column for "${FIELDS.find((x) => x.key === f)!.label}" is not in the file`, 400);
    if (used.has(col)) throw new AppError(`Column "${imp.headers[col]}" is chosen for two details; choose it once`, 400);
    used.add(col);
    clean[f] = col;
  }
  const missing = missingRequired(clean);
  if (missing.length) {
    throw new AppError(`Choose the column for: ${missing.map((k) => FIELDS.find((x) => x.key === k)!.label).join(', ')}`, 400);
  }
  return withTransaction(async (c) => {
    await c.query(
      `UPDATE partner_stock_imports SET mapping = $2, mapping_source = 'confirmed', mapping_confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $1`, [id, JSON.stringify(clean)]);
    await c.query(
      `INSERT INTO partner_import_mappings (partner_id, headers, mapping, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (partner_id) DO UPDATE SET headers = EXCLUDED.headers, mapping = EXCLUDED.mapping,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [partnerId, JSON.stringify(imp.headers), JSON.stringify(mappingToNames(imp.headers, clean)), userId]);
    return evaluateImport(c, id, partnerId);
  });
}

/** Check every line again (e.g. after Dawabag added a requested product). */
export async function recheckImport(id: string, partnerId: string) {
  const imp = await loadImport(id, partnerId);
  assertDraft(imp);
  return withTransaction((c) => evaluateImport(c, id, partnerId));
}

async function rowOf(importId: string, rowId: string) {
  const row = await queryOne<any>('SELECT * FROM partner_stock_import_rows WHERE id = $1 AND import_id = $2', [rowId, importId]);
  if (!row) throw new AppError('Line not found in this import', 404);
  return row;
}

/** "This line is that Dawabag product": remembered for every later import (partner_item_links). */
export async function linkRow(id: string, rowId: string, partnerId: string, userId: string, productId: string) {
  const imp = await loadImport(id, partnerId);
  assertDraft(imp);
  const row = await rowOf(id, rowId);
  if (!row.item_key) throw new AppError('This line has no item name, so it cannot be linked', 400);
  const product = await queryOne<{ id: string; name: string; drug_schedule: string }>(
    'SELECT id, name, drug_schedule FROM products WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL', [productId]);
  if (!product) throw new AppError('Product not found in the Dawabag catalogue', 404);
  if (NEVER_ONLINE.includes(product.drug_schedule)) throw new AppError(`${product.name} can never be sold online (C-10)`, 403);
  return withTransaction(async (c) => {
    await c.query(
      `INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source, created_by)
       VALUES ($1, $2, $3, $4, 'manual', $5)
       ON CONFLICT (partner_id, item_key) DO UPDATE SET product_id = EXCLUDED.product_id, item_label = EXCLUDED.item_label,
         source = 'manual', created_by = EXCLUDED.created_by, updated_at = NOW()`,
      [partnerId, row.item_key, productId, row.parsed?.item_name?.slice(0, 500) ?? null, userId]);
    await writeAuditTx(c, { userId, action: 'partner_item_linked', performedBy: userId,
      newValue: { vendor_id: partnerId, import_id: id, item_key: row.item_key, product_id: productId } });
    const summary = await evaluateImport(c, id, partnerId);
    await c.query(`UPDATE partner_stock_import_rows SET match_method = 'manual' WHERE import_id = $1 AND item_key = $2 AND product_id = $3`,
      [id, row.item_key, productId]);
    return { summary };
  });
}

/** Forget the link (wrong product chosen); the line is checked again from scratch. */
export async function unlinkRow(id: string, rowId: string, partnerId: string, userId: string) {
  const imp = await loadImport(id, partnerId);
  assertDraft(imp);
  const row = await rowOf(id, rowId);
  return withTransaction(async (c) => {
    if (row.item_key) {
      await c.query('DELETE FROM partner_item_links WHERE partner_id = $1 AND item_key = $2', [partnerId, row.item_key]);
      await writeAuditTx(c, { userId, action: 'partner_item_unlinked', performedBy: userId,
        newValue: { vendor_id: partnerId, import_id: id, item_key: row.item_key, product_id: row.product_id } });
    }
    return { summary: await evaluateImport(c, id, partnerId) };
  });
}

/**
 * Ask Dawabag to add items that are not in the catalogue. The admin creates the
 * product (schedule, generic name, HSN, cold chain, copy reviewed by the pharmacist,
 * C-19; Schedule X / NDPS never, C-10) and links the request; the next upload matches.
 * rowIds = null → every line still needing review.
 */
export async function requestNewProducts(id: string, partnerId: string, userId: string, rowIds: string[] | null) {
  const imp = await loadImport(id, partnerId);
  assertDraft(imp);
  return withTransaction(async (c) => {
    const rows = (await c.query<any>(
      `SELECT id, item_key, parsed FROM partner_stock_import_rows
       WHERE import_id = $1 AND status = 'needs_review' AND product_id IS NULL AND item_key IS NOT NULL
         AND ($2::uuid[] IS NULL OR id = ANY($2)) ORDER BY row_number`, [id, rowIds])).rows;
    const byKey = new Map<string, any>();
    for (const r of rows) if (!byKey.has(r.item_key)) byKey.set(r.item_key, r);
    let created = 0;
    for (const [key, r] of byKey) {
      const p = r.parsed ?? {};
      const ins = await c.query(
        `INSERT INTO partner_product_requests (partner_id, import_id, item_key, item_name, pack, manufacturer, item_code, hsn_code,
           gst_rate, mrp_paise, ptr_paise, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (partner_id, item_key) WHERE status IN ('open', 'drafted') DO NOTHING RETURNING id`,
        [partnerId, id, key, String(p.item_name ?? '').slice(0, 500), p.pack?.slice(0, 100) ?? null, p.manufacturer?.slice(0, 255) ?? null,
         p.item_code?.slice(0, 100) ?? null, p.hsn?.slice(0, 20) ?? null, p.gst_rate ?? null, p.mrp_paise ?? null, p.ptr_paise ?? null, userId]);
      created += ins.rowCount ?? 0;
    }
    await c.query(`UPDATE partner_stock_import_rows SET new_product_requested = TRUE WHERE import_id = $1 AND id = ANY($2)`,
      [id, rows.map((r) => r.id)]);
    await writeAuditTx(c, { userId, action: 'partner_product_requested', performedBy: userId,
      newValue: { vendor_id: partnerId, import_id: id, items: byKey.size, new_requests: created } });
    const summary = await evaluateImport(c, id, partnerId);
    return { items: byKey.size, new_requests: created, summary };
  });
}

export async function cancelImport(id: string, partnerId: string, userId: string) {
  const imp = await loadImport(id, partnerId);
  assertDraft(imp);
  await query(`UPDATE partner_stock_imports SET status = 'cancelled', cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
               WHERE id = $1 AND status = 'draft'`, [id, userId]);
  return { status: 'cancelled' };
}

// ── Admin: new-product requests ─────────────────────────────────────────────
export const REQUEST_STATUSES = ['open', 'drafted', 'linked', 'rejected'] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];

export async function listProductRequests(status: RequestStatus = 'open') {
  return query(
    `SELECT r.*, v.name AS partner_name, p.name AS product_name, p.catalogue_state AS product_state FROM partner_product_requests r
     JOIN vendors v ON v.id = r.partner_id LEFT JOIN products p ON p.id = r.product_id
     WHERE r.status = $1 ORDER BY r.requested_at ASC LIMIT 500`, [status]);
}

/** Link a request to the product the admin created (or found); the partner's next import matches it. */
export async function resolveProductRequest(id: string, adminId: string, input: { product_id?: string; reject_reason?: string }) {
  return withTransaction(async (c) => {
    const r = (await c.query<any>(`SELECT * FROM partner_product_requests WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) throw new AppError('Request not found', 404);
    if (r.status !== 'open') throw new AppError('This request is already closed', 409);
    if (input.product_id) {
      const p = (await c.query<any>('SELECT id, name, drug_schedule, catalogue_state FROM products WHERE id = $1 AND deleted_at IS NULL', [input.product_id])).rows[0];
      if (!p) throw new AppError('Product not found', 404);
      if (NEVER_ONLINE.includes(p.drug_schedule) || p.catalogue_state === 'not_listed') throw new AppError(`${p.name} can never be sold online (C-10)`, 403);
      await c.query(
        `INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source, created_by)
         VALUES ($1, $2, $3, $4, 'admin', $5)
         ON CONFLICT (partner_id, item_key) DO UPDATE SET product_id = EXCLUDED.product_id, source = 'admin', updated_at = NOW()`,
        [r.partner_id, r.item_key, p.id, r.item_name, adminId]);
      // Linked to a draft (Sprint 29): 'drafted' until the pharmacist approves it
      await c.query(`UPDATE partner_product_requests SET status = $4, product_id = $2, resolved_by = $3, resolved_at = NOW() WHERE id = $1`,
        [id, p.id, adminId, p.catalogue_state === 'draft' ? 'drafted' : 'linked']);
    } else {
      if (!input.reject_reason?.trim()) throw new AppError('Give a reason, or choose the product to link', 400);
      await c.query(`UPDATE partner_product_requests SET status = 'rejected', resolution_note = $2, resolved_by = $3, resolved_at = NOW() WHERE id = $1`,
        [id, input.reject_reason.trim(), adminId]);
    }
    await writeAuditTx(c, { userId: null, action: input.product_id ? 'partner_product_request_linked' : 'partner_product_request_rejected',
      performedBy: adminId, newValue: { request_id: id, vendor_id: r.partner_id, product_id: input.product_id ?? null }, notes: input.reject_reason ?? null });
    const done = (await c.query<{ status: string }>('SELECT status FROM partner_product_requests WHERE id = $1', [id])).rows[0];
    return { status: done.status };
  });
}
