// Sprint 29 — Admin → Partner stock files → Requests → "Create drafts".
// One transaction: each chosen open request becomes (or joins) a DRAFT product
// pre-filled only with what the partner's file said — name, pack, company code,
// GST % (when it is a slab we accept) and MRP. Schedule, generic name, HSN,
// category, cold chain and copy are left blank for the pharmacist (C-19, C-25);
// a draft is never active (database guard, C-10). Each request's partner item is
// linked to its draft (partner_item_links), so the partner's next upload or
// re-check matches it as soon as the draft is approved. One audit entry (C-46).
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { DraftRequest, ExistingProduct, planDrafts } from './dedupe';
import { gstFromFile } from './rules';

export const MAX_DRAFT_BATCH = 2000;

type Req = DraftRequest & { partner_name: string; hsn_code: string | null; item_code: string | null; ptr_paise: number | null };

export interface DraftsResult {
  drafts_created: number;
  requests_drafted: number;       // requests now linked to a draft (new or earlier)
  requests_linked: number;        // requests linked straight to an active product
  grouped: number;                // requests that shared a draft with another request in this batch
  skipped: { request_id: string; item_name: string; partner_name: string; reason: string }[];
  product_ids: string[];
}

const fileEntry = (r: Req) => ({
  request_id: r.id, partner_id: r.partner_id, partner_name: r.partner_name, item_name: r.item_name, pack: r.pack,
  company: r.manufacturer, gst_rate: r.gst_rate === null ? null : Number(r.gst_rate), mrp_paise: r.mrp_paise,
  hsn_code: r.hsn_code, item_code: r.item_code,
});

async function linkItem(c: PoolClient, r: Req, productId: string, adminId: string, status: 'drafted' | 'linked') {
  await c.query(
    `INSERT INTO partner_item_links (partner_id, item_key, product_id, item_label, source, created_by)
     VALUES ($1, $2, $3, $4, 'admin', $5)
     ON CONFLICT (partner_id, item_key) DO UPDATE SET product_id = EXCLUDED.product_id, item_label = EXCLUDED.item_label,
       source = 'admin', created_by = EXCLUDED.created_by, updated_at = NOW()`,
    [r.partner_id, r.item_key, productId, r.item_name.slice(0, 500), adminId]);
  await c.query(
    `UPDATE partner_product_requests SET status = $2, product_id = $3, resolved_by = $4, resolved_at = NOW() WHERE id = $1`,
    [r.id, status, productId, adminId]);
}

async function insertDraft(c: PoolClient, lead: Req, group: Req[], adminId: string): Promise<string> {
  const sku = `NEW-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const product = (await c.query<{ id: string }>(
    `INSERT INTO products (name, sku, category, drug_schedule, gst_rate, marketed_by, net_quantity, mrp_paise, offer_price_paise,
                           is_active, catalogue_state, content_status, country_of_origin, cold_chain)
     VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $6, FALSE, 'draft', 'pending_review', NULL, FALSE) RETURNING id`,
    [lead.item_name.trim().slice(0, 500), sku, gstFromFile(lead.gst_rate), lead.manufacturer?.trim().slice(0, 255) || null,
     lead.pack?.trim().slice(0, 50) || null, lead.mrp_paise])).rows[0];
  const fromFile = { ...fileEntry(lead), requests: group.map(fileEntry) };
  await c.query(
    `INSERT INTO catalogue_drafts (product_id, source, from_file, created_by, updated_by) VALUES ($1, 'partner_request', $2, $3, $3)`,
    [product.id, JSON.stringify(fromFile), adminId]);
  return product.id;
}

/** requestIds = null → every open request. */
export async function createDraftsFromRequests(adminId: string, requestIds: string[] | null): Promise<DraftsResult> {
  return withTransaction(async (c) => {
    const requests = (await c.query<Req>(
      `SELECT r.id, r.partner_id, r.item_key, r.item_name, r.pack, r.manufacturer, r.gst_rate, r.mrp_paise, r.hsn_code, r.item_code,
              r.ptr_paise, v.name AS partner_name
       FROM partner_product_requests r JOIN vendors v ON v.id = r.partner_id
       WHERE r.status = 'open' AND ($1::uuid[] IS NULL OR r.id = ANY($1))
       ORDER BY r.requested_at, r.id
       LIMIT ${MAX_DRAFT_BATCH + 1}
       FOR UPDATE OF r`, [requestIds])).rows;
    if (!requests.length) throw new AppError('No open requests chosen', 400);
    if (requests.length > MAX_DRAFT_BATCH) throw new AppError(`Up to ${MAX_DRAFT_BATCH} requests at a time`, 400);

    // Active products and earlier drafts a request could clearly be (Schedule X / NDPS included, to refuse them)
    const existing = (await c.query<ExistingProduct>(
      `SELECT id, name, net_quantity, manufacturer_name, marketed_by, drug_schedule, catalogue_state FROM products
       WHERE deleted_at IS NULL AND ((catalogue_state = 'live' AND is_active) OR catalogue_state = 'draft')`)).rows;

    const out: DraftsResult = { drafts_created: 0, requests_drafted: 0, requests_linked: 0, grouped: 0, skipped: [], product_ids: [] };
    for (const g of planDrafts(requests, existing)) {
      const group = g.requests as Req[];
      if (g.action === 'skip') {
        out.skipped.push(...group.map((r) => ({ request_id: r.id, item_name: r.item_name, partner_name: r.partner_name, reason: g.reason })));
        continue;
      }
      if (g.action === 'existing' && g.product.catalogue_state === 'live') {
        for (const r of group) await linkItem(c, r, g.product.id, adminId, 'linked');
        out.requests_linked += group.length;
        continue;
      }
      let productId: string;
      if (g.action === 'existing') {
        productId = g.product.id;
        // Note the extra partner(s) on the earlier draft, so the pharmacist sees every source
        await c.query(
          `UPDATE catalogue_drafts SET from_file = jsonb_set(from_file, '{requests}', COALESCE(from_file->'requests', '[]'::jsonb) || $2::jsonb),
                  updated_at = NOW() WHERE product_id = $1`,
          [productId, JSON.stringify(group.map(fileEntry))]);
        out.grouped += group.length;
      } else {
        productId = await insertDraft(c, g.lead as Req, group, adminId);
        out.drafts_created++;
        out.grouped += group.length - 1;
      }
      for (const r of group) await linkItem(c, r, productId, adminId, 'drafted');
      out.requests_drafted += group.length;
      out.product_ids.push(productId);
    }
    await writeAuditTx(c, { userId: null, action: 'catalogue_drafts_created', performedBy: adminId,
      newValue: { requests: requests.length, drafts_created: out.drafts_created, requests_drafted: out.requests_drafted,
        requests_linked: out.requests_linked, skipped: out.skipped.length, product_ids: out.product_ids } });
    return out;
  });
}
