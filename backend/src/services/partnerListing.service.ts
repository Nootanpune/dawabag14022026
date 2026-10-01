// src/services/partnerListing.service.ts
// Partner product listings: submission (catalogue-price model), the Schedule
// H1 gate, stock batches, and Dawabag's review (Sprint 3 tasks 17, 18, 22).
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAudit, writeAuditTx } from '../utils/audit';
import { assertBatchReceivable } from './recallAlerts/receiptGate';


const BLOCKED = ['Schedule X', 'NDPS'];

export interface ListingInput {
  product_id: string;
  partner_sku?: string;
  catalogue_price_accepted: boolean;
  h1_pharmacist_name?: string;
  h1_pharmacist_reg_no?: string;
  h1_secure_storage_declared?: boolean;
}

// Partner must be approved, GST-registered and hold an unexpired licence (C-33)
async function assertPartnerCanSell(vendorId: string) {
  const v = await queryOne<any>(
    `SELECT approval_status, is_active, gst_number, drug_license_expiry, vendor_type
     FROM vendors WHERE id = $1`, [vendorId]);
  if (!v || v.approval_status !== 'approved' || !v.is_active) throw new AppError('Your partner account is not approved yet', 403);
  if (!['marketplace_partner', 'both'].includes(v.vendor_type)) throw new AppError('This account is not a marketplace partner', 403);
  if (!v.gst_number) throw new AppError('A GST registration is required to sell on Dawabag', 403);
  if (v.drug_license_expiry && new Date(v.drug_license_expiry) < new Date(new Date().toDateString())) {
    throw new AppError('Your drug licence has expired; upload the renewal to continue selling', 403);
  }
}

// Schedule H1 needs a named pharmacist and a secure-storage declaration (task 22)
function h1Problems(schedule: string | null, l: { h1_pharmacist_name?: string | null; h1_pharmacist_reg_no?: string | null; h1_secure_storage_declared?: boolean | null }): string | null {
  if (schedule !== 'Schedule H1') return null;
  if (!l.h1_pharmacist_name || !l.h1_pharmacist_reg_no) return 'Schedule H1 listings need the registered pharmacist\'s name and registration number';
  if (!l.h1_secure_storage_declared) return 'Schedule H1 listings need the secure-storage declaration';
  return null;
}

export async function submitListing(vendorId: string, userId: string, input: ListingInput) {
  await assertPartnerCanSell(vendorId);
  if (!input.catalogue_price_accepted) {
    throw new AppError('Partners sell at Dawabag\'s catalogue price; please accept it to list', 400);
  }
  const product = await queryOne<any>(
    `SELECT id, name, generic_name, drug_schedule, gst_rate, mrp_paise, cold_chain
     FROM products WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`, [input.product_id]);
  if (!product) throw new AppError('Product not found in the Dawabag catalogue', 404);
  if (BLOCKED.includes(product.drug_schedule)) throw new AppError(`${product.name} cannot be sold online`, 403);
  const h1 = h1Problems(product.drug_schedule, input);
  if (h1) throw new AppError(h1, 400);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO partner_products
       (partner_id, product_id, medicine_name, generic_name, partner_sku, drug_schedule, gst_rate, mrp_paise,
        cold_chain, prescription_required, catalogue_price_accepted,
        h1_pharmacist_name, h1_pharmacist_reg_no, h1_secure_storage_declared, h1_declared_at, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,$15)
     ON CONFLICT (partner_id, product_id) WHERE product_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [vendorId, product.id, product.name, product.generic_name, input.partner_sku || null, product.drug_schedule,
     product.gst_rate, product.mrp_paise, product.cold_chain,
     ['Schedule H', 'Schedule H1'].includes(product.drug_schedule),
     input.h1_pharmacist_name || null, input.h1_pharmacist_reg_no || null, !!input.h1_secure_storage_declared,
     product.drug_schedule === 'Schedule H1' ? new Date() : null, userId]
  );
  if (!row) throw new AppError('You have already listed this product', 409);
  await writeAudit({ userId, action: 'partner_listing_submitted', performedBy: userId,
    newValue: { vendor_id: vendorId, partner_product_id: row.id, product_id: product.id } });
  return row;
}

export async function listPartnerProducts(vendorId: string) {
  return query(
    `SELECT pp.id, pp.product_id, pp.medicine_name, pp.partner_sku, pp.drug_schedule, pp.mrp_paise,
            pp.cold_chain, pp.approval_status, pp.listing_status, pp.rejection_reason_code,
            pp.rejection_details, pp.submission_date, pp.posted_at,
            COALESCE(SUM(pi.qty_available), 0)::int AS qty_available,
            COALESCE(SUM(pi.qty_reserved), 0)::int AS qty_reserved,
            MIN(pi.expiry_date) AS earliest_expiry
     FROM partner_products pp
     LEFT JOIN partner_inventory pi ON pi.partner_product_id = pp.id
     WHERE pp.partner_id = $1
     GROUP BY pp.id ORDER BY pp.medicine_name`, [vendorId]);
}

export interface BatchInput {
  batch_number: string;
  qty_available: number;
  expiry_date: string;
  manufactured_date?: string;
  cold_chain_confirmed?: boolean;
}

// Absolute stock per batch; never below what is already reserved for orders
export async function upsertInventory(vendorId: string, partnerProductId: string, batches: BatchInput[], userId: string) {
  return withTransaction(async (client: PoolClient) => {
    const pp = (await client.query(
      'SELECT id, product_id, cold_chain FROM partner_products WHERE id = $1 AND partner_id = $2', [partnerProductId, vendorId])).rows[0];
    if (!pp) throw new AppError('Listing not found', 404);
    for (const b of batches) {
      if (pp.cold_chain && !b.cold_chain_confirmed) {
        throw new AppError(`Batch ${b.batch_number}: confirm cold storage (2–8 °C) for this refrigerated product`, 400);
      }
      // A recalled batch, or one on a regulator alert, cannot be listed (C-28)
      await assertBatchReceivable(client, pp.product_id, b.batch_number);
      const existing = (await client.query(
        `SELECT qty_reserved FROM partner_inventory WHERE partner_product_id = $1 AND batch_number = $2 FOR UPDATE`,
        [partnerProductId, b.batch_number])).rows[0];
      if (existing && b.qty_available < existing.qty_reserved) {
        throw new AppError(`Batch ${b.batch_number}: ${existing.qty_reserved} units are reserved for orders`, 400);
      }
      await client.query(
        `INSERT INTO partner_inventory
           (partner_product_id, partner_id, batch_number, qty_available, expiry_date, manufactured_date, cold_chain_confirmed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (partner_product_id, batch_number) DO UPDATE SET
           qty_available = EXCLUDED.qty_available, expiry_date = EXCLUDED.expiry_date,
           manufactured_date = EXCLUDED.manufactured_date,
           cold_chain_confirmed = EXCLUDED.cold_chain_confirmed, last_updated_at = NOW()`,
        [partnerProductId, vendorId, b.batch_number, b.qty_available, b.expiry_date,
         b.manufactured_date || null, !!b.cold_chain_confirmed]
      );
    }
    await writeAuditTx(client, { userId, action: 'partner_inventory_updated', performedBy: userId,
      newValue: { vendor_id: vendorId, partner_product_id: partnerProductId, batches: batches.map((b) => [b.batch_number, b.qty_available]) } });
    return (await client.query(
      `SELECT batch_number, qty_available, qty_reserved, expiry_date, cold_chain_confirmed
       FROM partner_inventory WHERE partner_product_id = $1 ORDER BY expiry_date`, [partnerProductId])).rows;
  });
}

// ── Dawabag review ───────────────────────────────────────────────────────────
export async function reviewQueue() {
  return query(
    `SELECT pp.id, pp.product_id, pp.medicine_name, pp.drug_schedule, pp.mrp_paise, pp.cold_chain,
            pp.partner_sku, pp.submission_date, pp.approval_status, pp.listing_status,
            pp.h1_pharmacist_name, pp.h1_pharmacist_reg_no, pp.h1_secure_storage_declared,
            v.id AS partner_id, v.name AS partner_name, v.pincode, v.vendor_rating, v.gst_number,
            v.drug_license_no, v.drug_license_expiry,
            COALESCE((SELECT SUM(qty_available) FROM partner_inventory pi WHERE pi.partner_product_id = pp.id), 0)::int AS qty_available
     FROM partner_products pp JOIN vendors v ON v.id = pp.partner_id
     WHERE pp.approval_status IN ('pending', 'on_hold', 'more_info_needed')
        OR (pp.approval_status = 'approved' AND pp.listing_status = 'pending')
     ORDER BY pp.submission_date ASC, pp.created_at ASC`);
}

export async function approveListing(id: string, reviewerId: string) {
  const pp = await queryOne<any>('SELECT * FROM partner_products WHERE id = $1', [id]);
  if (!pp) throw new AppError('Listing not found', 404);
  if (pp.approval_status === 'approved') throw new AppError('Already approved', 409);
  const h1 = h1Problems(pp.drug_schedule, pp);
  if (h1) throw new AppError(`Cannot approve: ${h1}`, 400);
  await query(
    `UPDATE partner_products SET approval_status = 'approved', listing_status = 'pending',
       reviewed_by = $2, reviewed_at = NOW(), rejection_reason_code = NULL, rejection_details = NULL, updated_at = NOW()
     WHERE id = $1`, [id, reviewerId]);
  await writeAudit({ userId: null, action: 'partner_listing_approved', performedBy: reviewerId, newValue: { partner_product_id: id } });
}

export async function rejectListing(id: string, code: string, details: string | undefined, reviewerId: string) {
  const r = await queryOne('UPDATE partner_products SET approval_status = \'rejected\', listing_status = \'not_listed\', rejection_reason_code = $2, rejection_details = $3, reviewed_by = $4, reviewed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id',
    [id, code, details || null, reviewerId]);
  if (!r) throw new AppError('Listing not found', 404);
  await writeAudit({ userId: null, action: 'partner_listing_rejected', performedBy: reviewerId, newValue: { partner_product_id: id, code }, notes: details });
}

export async function postLive(id: string, adminId: string) {
  const pp = await queryOne<any>(
    `SELECT pp.id, pp.approval_status, pp.partner_id FROM partner_products pp WHERE pp.id = $1`, [id]);
  if (!pp || pp.approval_status !== 'approved') throw new AppError('Listing not found or not approved', 400);
  await assertPartnerCanSell(pp.partner_id);
  await query(`UPDATE partner_products SET listing_status = 'live', posted_at = NOW(), posted_by = $2, updated_at = NOW() WHERE id = $1`, [id, adminId]);
  await writeAudit({ userId: null, action: 'partner_listing_live', performedBy: adminId, newValue: { partner_product_id: id } });
}
