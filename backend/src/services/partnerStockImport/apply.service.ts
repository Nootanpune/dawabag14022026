// Apply a checked import to the partner's OWN stock ledger, in one transaction, the
// same way the listing stock editor does (partnerListing.upsertInventoryTx): owner
// decision 1 Oct 2026 — partner stock stays in partner_inventory, never Dawabag's
// batches, never another partner's (C-05, C-25, C-28).
//
// What it writes, per Dawabag product with at least one matched line:
//   • a listing if the partner has none (catalogue price accepted; Dawabag reviews it
//     before it sells; Schedule H1 needs the pharmacist's details — C-16, C-19),
//   • each batch in the file: quantity (+ free) as the absolute stock, never below what
//     is reserved for open orders,
//   • the partner's other batches of that product that are NOT in the file at all:
//     set to what is reserved (0 when nothing is) — the file is the shelf count.
//     A batch that is in the file on a line with a problem is left as it was.
// Products not in the file are not touched (the export may be partial).
// Applying twice is refused (status 'applied', row lock). One audit entry (C-46).
import { PoolClient } from 'pg';
import { withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { batchKey, batchKeySql } from '../recallAlerts/batchKey';
import { assertPartnerCanSell, BatchInput, h1Problems, insertListingTx, upsertInventoryTx } from '../partnerListing.service';
import { evaluateImport } from './evaluate';
import { assertDraft, DRAFT_VALID_HOURS } from './import.service';
import { assertManualStock } from '../partnerLiveFeed/settings.service';
import type { ParsedRow } from './rows';

export interface ApplyInput {
  /** Required when the import creates new listings (partners sell at Dawabag's catalogue price) */
  catalogue_price_accepted?: boolean;
  /** "Refrigerated items in this file are stored at 2–8 °C" (C-25) */
  cold_chain_confirmed?: boolean;
  /** For new Schedule H1 listings */
  h1_pharmacist_name?: string;
  h1_pharmacist_reg_no?: string;
  h1_secure_storage_declared?: boolean;
}

export interface ApplyResult {
  lines_applied: number;
  products_updated: number;
  listings_created: number;
  batches_set: number;
  batches_zeroed: number;
  packs: number;
  /** Matched lines that could not be applied, by reason */
  skipped: { reason: string; lines: number; products: string[] }[];
  /** Lines left out because they need review or have problems */
  not_applied: { needs_review: number; problem: number };
}

interface Line { id: string; row_number: number; status: string; product_id: string; item_key: string | null; match_method: string | null; parsed: ParsedRow }

export async function applyImport(id: string, partnerId: string, userId: string, input: ApplyInput): Promise<ApplyResult> {
  return withTransaction(async (c: PoolClient) => {
    const imp = (await c.query('SELECT * FROM partner_stock_imports WHERE id = $1 AND partner_id = $2 FOR UPDATE', [id, partnerId])).rows[0];
    if (!imp) throw new AppError('Import not found', 404);
    assertDraft(imp);
    // Sprint 37: a partner on the live feed has one authority for quantities — its software
    await assertManualStock(partnerId, c);
    if (!imp.mapping_confirmed_at) throw new AppError('Confirm which column holds each detail before applying', 400);
    if (Date.now() - new Date(imp.created_at).getTime() > DRAFT_VALID_HOURS * 3_600_000) {
      throw new AppError(`This file was uploaded more than ${DRAFT_VALID_HOURS} hours ago; stock has moved since. Upload a fresh export`, 409);
    }

    // Fresh checks inside the transaction: the ledger is written from these, not from the preview
    const summary = await evaluateImport(c, id, partnerId);
    const lines = (await c.query<Line>(
      `SELECT id, row_number, status, product_id, item_key, match_method, parsed FROM partner_stock_import_rows
       WHERE import_id = $1 AND product_id IS NOT NULL AND status <> 'skipped' ORDER BY row_number`, [id])).rows;
    const matched = lines.filter((l) => l.status === 'matched');
    if (!matched.length) throw new AppError('No line is ready to apply: link the items or fix the problems first', 400);

    // Every batch the file mentions per product (any status): those are never zeroed
    const inFile = new Map<string, Set<string>>();
    for (const l of lines) if (l.parsed?.batch_number) {
      const set = inFile.get(l.product_id) ?? new Set<string>();
      set.add(batchKey(l.parsed.batch_number));
      inFile.set(l.product_id, set);
    }

    const productIds = [...new Set(matched.map((l) => l.product_id))];
    const products = new Map((await c.query(
      `SELECT id, name, generic_name, drug_schedule, gst_rate, mrp_paise, COALESCE(cold_chain, FALSE) AS cold_chain
       FROM products WHERE id = ANY($1)`, [productIds])).rows.map((p) => [p.id, p]));
    const listings = new Map((await c.query(
      'SELECT id, product_id FROM partner_products WHERE partner_id = $1 AND product_id = ANY($2)', [partnerId, productIds])).rows
      .map((r) => [r.product_id, r.id as string]));
    let cannotList: string | null = null;
    try { await assertPartnerCanSell(partnerId, c); } catch (e) { cannotList = (e as Error).message; }

    const result: ApplyResult = {
      lines_applied: 0, products_updated: 0, listings_created: 0, batches_set: 0, batches_zeroed: 0, packs: 0,
      skipped: [], not_applied: { needs_review: summary.needs_review, problem: summary.problem },
    };
    const skip = (reason: string, product: { name: string }, n: number) => {
      let s = result.skipped.find((x) => x.reason === reason);
      if (!s) { s = { reason, lines: 0, products: [] }; result.skipped.push(s); }
      s.lines += n;
      if (s.products.length < 20) s.products.push(product.name);
    };

    for (const productId of productIds) {
      const product = products.get(productId)!;
      const own = matched.filter((l) => l.product_id === productId);
      if (product.cold_chain && !input.cold_chain_confirmed) { skip('Refrigerated: cold storage (2–8 °C) not confirmed (C-25)', product, own.length); continue; }
      let ppId = listings.get(productId);
      if (!ppId) {
        if (cannotList) { skip(`New listing not possible: ${cannotList}`, product, own.length); continue; }
        if (!input.catalogue_price_accepted) { skip('New listing: Dawabag\'s catalogue price was not accepted', product, own.length); continue; }
        const h1 = h1Problems(product.drug_schedule, input);
        if (h1) { skip(h1, product, own.length); continue; }
        const row = await insertListingTx(c, partnerId, userId, product, {
          catalogue_price_accepted: true, partner_sku: own.find((l) => l.parsed.item_code)?.parsed.item_code ?? undefined,
          h1_pharmacist_name: input.h1_pharmacist_name, h1_pharmacist_reg_no: input.h1_pharmacist_reg_no,
          h1_secure_storage_declared: input.h1_secure_storage_declared,
        });
        if (!row) throw new AppError('A listing was added while applying; apply again', 409);
        ppId = row.id;
        result.listings_created++;
      }

      // Batches: same batch on several lines is added up; spelling follows the ledger's
      const existing = new Map((await c.query<{ batch_number: string; qty_reserved: number }>(
        'SELECT batch_number, qty_reserved FROM partner_inventory WHERE partner_product_id = $1', [ppId])).rows
        .map((b) => [batchKey(b.batch_number), b]));
      const batches = new Map<string, BatchInput>();
      for (const l of own) {
        const key = batchKey(l.parsed.batch_number!);
        const b = batches.get(key);
        const qty = l.parsed.total_quantity ?? 0;
        if (b) {
          b.qty_available += qty;
          if (l.parsed.expiry_date! < b.expiry_date) b.expiry_date = l.parsed.expiry_date!;   // earliest wins (C-27)
          continue;
        }
        batches.set(key, {
          batch_number: existing.get(key)?.batch_number ?? l.parsed.batch_number!, qty_available: qty,
          expiry_date: l.parsed.expiry_date!, cold_chain_confirmed: !!(product.cold_chain && input.cold_chain_confirmed),
          purchase_price_paise: l.parsed.purchase_rate_paise ?? null,
        });
      }
      for (const [key, b] of batches) {
        const reserved = Number(existing.get(key)?.qty_reserved ?? 0);
        if (b.qty_available < reserved) b.qty_available = reserved;   // never below open orders
        result.packs += b.qty_available;
      }
      await upsertInventoryTx(c, partnerId, ppId, [...batches.values()], userId, { audit: false });
      const zeroed = await c.query(
        `UPDATE partner_inventory SET qty_available = qty_reserved, last_updated_at = NOW()
         WHERE partner_product_id = $1 AND qty_available <> qty_reserved AND NOT (${batchKeySql('batch_number')} = ANY($2))`,
        [ppId, [...(inFile.get(productId) ?? [])]]);
      result.batches_set += batches.size;
      result.batches_zeroed += zeroed.rowCount ?? 0;
      result.products_updated++;
      result.lines_applied += own.length;

      // Exact matches are remembered, so the next file links even if names drift in the catalogue
      for (const key of new Set(own.filter((l) => l.item_key && l.match_method !== 'item_link').map((l) => l.item_key!))) {
        await c.query(
          `INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source, created_by)
           VALUES ($1, $2, $3, $4, 'auto', $5) ON CONFLICT (partner_id, item_key) DO NOTHING`,
          [partnerId, key, productId, own.find((l) => l.item_key === key)?.parsed.item_name?.slice(0, 500) ?? null, userId]);
      }
    }

    // Nothing written: roll back so the partner can fix the reason and apply this import again
    if (!result.lines_applied) throw new AppError(`Nothing was applied: ${result.skipped.map((s) => s.reason).join('; ')}`, 400);

    await c.query(
      `UPDATE partner_stock_imports SET status = 'applied', applied_by = $2, applied_at = NOW(), result = $3, updated_at = NOW()
       WHERE id = $1`, [id, userId, JSON.stringify(result)]);
    await writeAuditTx(c, { userId, action: 'partner_stock_import_applied', performedBy: userId,
      newValue: { vendor_id: partnerId, import_id: id, file_sha256: imp.file_sha256, ...result, skipped: result.skipped.map((s) => [s.reason, s.lines]) } });
    return result;
  });
}
