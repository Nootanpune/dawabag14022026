// Sprint 37 — the live feed's items that wait for a person (owner decision 2,
// 2026-10-03). The partner — the seller of record and licensee (C-05) — checks them
// in its portal; Dawabag's admins see the same list (read-only) and are alerted.
//   new_product       link it to a Dawabag product, ask Dawabag to add it, or set it
//                     aside ("not sold on Dawabag" — not raised again)
//   new_listing       list it: catalogue price accepted (C-16), Schedule H1 details
//                     (C-19), cold storage for refrigerated items (C-25)
//   cold_chain_batch  confirm 2–8 °C storage for the new batch (C-25)
//   price_change      accept the new printed MRP / rate of the batch (C-16)
//   expiry_change     accept the later expiry of the batch (C-27)
//   short_for_orders  nothing to accept: it closes by itself when the software has the
//                     packs again (or the orders are dispatched / cancelled)
// Each decision is audited (C-46). Quantities are always the latest snapshot's.
import { PoolClient } from 'pg';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { assertPartnerCanSell, h1Problems, insertListingTx, upsertInventoryTx } from '../partnerListing.service';
import { linkItemTx, requestProductTx } from '../partnerStockImport/import.service';
import { NEVER_ONLINE } from '../partnerStockImport/validate';
import type { Provenance } from '../partnerProvenance/rules';

export const CHECK_STATUSES = ['open', 'accepted', 'dismissed', 'resolved'] as const;
export type CheckStatus = typeof CHECK_STATUSES[number];

export const KIND_LABEL: Record<string, string> = {
  new_product: 'New product — not on Dawabag yet',
  new_listing: 'Not listed by you yet',
  cold_chain_batch: 'New refrigerated batch',
  price_change: 'Price / MRP changed',
  expiry_change: 'Later expiry date',
  short_for_orders: 'Fewer packs than Dawabag orders hold',
};

export async function listChecks(partnerId: string | null, status: CheckStatus = 'open', limit = 200) {
  const rows = await query<any>(
    `SELECT c.id, c.partner_id, v.name AS partner_name, c.kind, c.item_key, c.batch_key, c.product_id, p.name AS product_name,
            p.drug_schedule AS product_schedule, COALESCE(p.cold_chain, FALSE) AS product_cold_chain, p.offer_price_paise, p.mrp_paise AS catalogue_mrp_paise,
            c.item_name, c.batch_number, c.details, c.status, c.first_seen_at, c.last_seen_at, c.resolved_at, c.resolution_note,
            up.full_name AS resolved_by_name
     FROM partner_feed_checks c JOIN vendors v ON v.id = c.partner_id
     LEFT JOIN products p ON p.id = c.product_id LEFT JOIN user_profiles up ON up.user_id = c.resolved_by
     WHERE ($1::uuid IS NULL OR c.partner_id = $1) AND c.status = $2
     ORDER BY c.first_seen_at ASC LIMIT $3`, [partnerId, status, limit]);
  return rows.map((r) => ({ ...r, kind_label: KIND_LABEL[r.kind] ?? r.kind }));
}

async function lockCheck(c: PoolClient, partnerId: string, id: string) {
  const row = (await c.query<any>('SELECT * FROM partner_feed_checks WHERE id = $1 AND partner_id = $2 FOR UPDATE', [id, partnerId])).rows[0];
  if (!row) throw new AppError('Item not found', 404);
  if (row.status !== 'open') throw new AppError('This item was already dealt with', 409);
  return row;
}

async function close(c: PoolClient, row: any, status: 'accepted' | 'dismissed', userId: string, note: string, extra: Record<string, unknown> = {}) {
  await c.query(`UPDATE partner_feed_checks SET status = $2, resolved_by = $3, resolved_at = NOW(), resolution_note = $4 WHERE id = $1`,
    [row.id, status, userId, note.slice(0, 500)]);
  await writeAuditTx(c, { userId, action: status === 'accepted' ? 'partner_feed_check_accepted' : 'partner_feed_check_dismissed', performedBy: userId,
    newValue: { vendor_id: row.partner_id, check_id: row.id, kind: row.kind, item_key: row.item_key, batch_number: row.batch_number,
      product_id: row.product_id, details: row.details, ...extra }, notes: note });
}

export interface AcceptInput {
  cold_chain_confirmed?: boolean;
  catalogue_price_accepted?: boolean;
  h1_pharmacist_name?: string;
  h1_pharmacist_reg_no?: string;
  h1_secure_storage_declared?: boolean;
}

/** Batches from the feed written through the listing editor's own rules (cold chain, recall gate, never below reserved). */
async function addBatches(c: PoolClient, partnerId: string, ppId: string, userId: string, coldChain: boolean,
  batches: { batch_number: string; expiry_date: string; quantity: number; mrp_paise?: number | null; sale_rate_paise?: number | null; purchase_price_paise?: number | null;
    provenance?: Provenance | null }[]) {
  const usable = batches.filter((b) => b.batch_number && b.expiry_date);
  if (!usable.length) return 0;
  await upsertInventoryTx(c, partnerId, ppId, usable.map((b) => ({
    batch_number: b.batch_number, qty_available: Math.max(0, Number(b.quantity) || 0), expiry_date: b.expiry_date,
    cold_chain_confirmed: coldChain, purchase_price_paise: b.purchase_price_paise ?? null,
    provenance: b.provenance ?? null,   // Sprint 39: what the feed said about the batch's supplier (C-02)
  })), userId, { audit: false, source: 'feed' });
  for (const b of usable) {
    await c.query(
      `UPDATE partner_inventory SET mrp_paise = $3, sale_rate_paise = $4, feed_quantity = $5, feed_updated_at = NOW()
       WHERE partner_product_id = $1 AND batch_number = $2`,
      [ppId, b.batch_number, b.mrp_paise ?? null, b.sale_rate_paise ?? null, Math.max(0, Number(b.quantity) || 0)]);
  }
  return usable.length;
}

export async function acceptCheck(partnerId: string, id: string, userId: string, input: AcceptInput) {
  return withTransaction(async (c) => {
    const row = await lockCheck(c, partnerId, id);
    const d = row.details ?? {};
    switch (row.kind) {
      case 'price_change': {
        await c.query(
          `UPDATE partner_inventory SET mrp_paise = COALESCE($2, mrp_paise), sale_rate_paise = COALESCE($3, sale_rate_paise), last_updated_at = NOW()
           WHERE id = $1 AND partner_id = $4`, [row.partner_inventory_id, d.mrp?.to ?? null, d.rate?.to ?? null, partnerId]);
        await close(c, row, 'accepted', userId, 'New MRP / rate accepted for this batch');
        break;
      }
      case 'expiry_change': {
        await c.query(`UPDATE partner_inventory SET expiry_date = $2::date, last_updated_at = NOW() WHERE id = $1 AND partner_id = $3`,
          [row.partner_inventory_id, d.to, partnerId]);
        await close(c, row, 'accepted', userId, `Expiry ${d.to} accepted (was ${d.from})`);
        break;
      }
      case 'cold_chain_batch': {
        if (!input.cold_chain_confirmed) throw new AppError('Confirm that this batch is stored at 2–8 °C (C-25)', 400);
        const pp = (await c.query<{ id: string }>('SELECT id FROM partner_products WHERE partner_id = $1 AND product_id = $2', [partnerId, row.product_id])).rows[0];
        if (!pp) throw new AppError('You no longer list this product', 409);
        await addBatches(c, partnerId, pp.id, userId, true, [{ batch_number: row.batch_number, expiry_date: d.expiry_date, quantity: d.quantity,
          mrp_paise: d.mrp_paise, sale_rate_paise: d.sale_rate_paise, purchase_price_paise: d.purchase_price_paise, provenance: d.provenance ?? null }]);
        await close(c, row, 'accepted', userId, 'Cold storage (2–8 °C) confirmed; batch added', { cold_chain_confirmed: true });
        break;
      }
      case 'new_listing': {
        const product = (await c.query<any>(
          `SELECT id, name, generic_name, drug_schedule, gst_rate, mrp_paise, COALESCE(cold_chain, FALSE) AS cold_chain, catalogue_state
           FROM products WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`, [row.product_id])).rows[0];
        if (!product) throw new AppError('This product is no longer in the Dawabag catalogue', 409);
        if (NEVER_ONLINE.includes(product.drug_schedule)) throw new AppError(`${product.name} can never be sold online (C-10)`, 403);
        await assertPartnerCanSell(partnerId, c);
        if (!input.catalogue_price_accepted) throw new AppError('Partners sell at Dawabag\'s catalogue price; accept it to list (C-16)', 400);
        const h1 = h1Problems(product.drug_schedule, input);
        if (h1) throw new AppError(h1, 400);
        if (product.cold_chain && !input.cold_chain_confirmed) throw new AppError('Confirm cold storage (2–8 °C) for this refrigerated product (C-25)', 400);
        const listing = await insertListingTx(c, partnerId, userId, product, {
          catalogue_price_accepted: true, partner_sku: d.item_code ?? undefined,
          h1_pharmacist_name: input.h1_pharmacist_name, h1_pharmacist_reg_no: input.h1_pharmacist_reg_no,
          h1_secure_storage_declared: input.h1_secure_storage_declared,
        });
        if (!listing) throw new AppError('You already list this product; the next snapshot updates its stock', 409);
        const added = await addBatches(c, partnerId, listing.id, userId, !!product.cold_chain, d.batches ?? []);
        await close(c, row, 'accepted', userId, `Listed with ${added} batch(es); Dawabag reviews the listing before it sells`,
          { partner_product_id: listing.id, catalogue_price_accepted: true, cold_chain_confirmed: !!input.cold_chain_confirmed });
        break;
      }
      case 'new_product':
        throw new AppError('Link this item to a Dawabag product, ask Dawabag to add it, or set it aside', 400);
      default:
        throw new AppError('This clears by itself when your software has the packs for the waiting orders again', 409);
    }
    return { status: 'accepted' };
  });
}

/** new_product: "this item is that Dawabag product" — the next snapshot applies it (or asks to list it). */
export async function linkCheck(partnerId: string, id: string, userId: string, productId: string) {
  return withTransaction(async (c) => {
    const row = await lockCheck(c, partnerId, id);
    if (row.kind !== 'new_product') throw new AppError('Only a new product can be linked', 400);
    const p = (await c.query<{ id: string; name: string; drug_schedule: string }>(
      'SELECT id, name, drug_schedule FROM products WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL', [productId])).rows[0];
    if (!p) throw new AppError('Product not found in the Dawabag catalogue', 404);
    if (NEVER_ONLINE.includes(p.drug_schedule)) throw new AppError(`${p.name} can never be sold online (C-10)`, 403);
    await linkItemTx(c, partnerId, row.item_key, p.id, row.item_name, userId, { check_id: row.id, via: 'live_feed' });
    await close(c, row, 'accepted', userId, `Linked to ${p.name}; the next snapshot applies it`, { linked_product_id: p.id });
    return { status: 'accepted', product_name: p.name };
  });
}

/** new_product: ask Dawabag to add it to the catalogue (same request list as the file import). Stays waiting. */
export async function requestProductForCheck(partnerId: string, id: string, userId: string) {
  return withTransaction(async (c) => {
    const row = await lockCheck(c, partnerId, id);
    if (row.kind !== 'new_product') throw new AppError('Only a new product can be requested', 400);
    const d = row.details ?? {};
    const created = await requestProductTx(c, partnerId, row.last_import_id, row.item_key, {
      item_name: row.item_name, pack: d.pack ?? null, manufacturer: d.manufacturer ?? null, item_code: d.item_code ?? null,
      hsn: d.hsn ?? null, gst_rate: d.gst_rate ?? null, mrp_paise: d.mrp_paise ?? null, ptr_paise: d.ptr_paise ?? null,
    }, userId);
    await c.query(`UPDATE partner_feed_checks SET details = details || jsonb_build_object('requested_at', NOW()) WHERE id = $1`, [row.id]);
    await writeAuditTx(c, { userId, action: 'partner_product_requested', performedBy: userId,
      newValue: { vendor_id: partnerId, check_id: row.id, item_key: row.item_key, new_requests: created ? 1 : 0, via: 'live_feed' } });
    return { status: 'open', requested: true, new_request: created };
  });
}

/** new_product: not for sale on Dawabag (e.g. a cosmetic) — not raised again. */
export async function dismissCheck(partnerId: string, id: string, userId: string, reason: string) {
  return withTransaction(async (c) => {
    const row = await lockCheck(c, partnerId, id);
    if (row.kind !== 'new_product') throw new AppError('Only a new product can be set aside; the others close when they are dealt with', 400);
    await close(c, row, 'dismissed', userId, `Not sold on Dawabag: ${reason}`);
    return { status: 'dismissed' };
  });
}
