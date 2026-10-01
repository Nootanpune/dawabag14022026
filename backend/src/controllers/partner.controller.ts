// src/controllers/partner.controller.ts — partner portal (role 'partner')
import { getReturn, listReturns } from '../services/return.service';
import { dispatchSchema, handoverSchema } from './fulfilment.controller';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { listPartnerProducts, submitListing, upsertInventory } from '../services/partnerListing.service';
import { dispatchShipment, listPartnerShipments, markShipmentDelivered } from '../services/partnerFulfilment.service';
import { getSettlement, listSettlements } from '../services/settlement.service';
import { rejectionLabel } from '../utils/rejectionCodes';
import { approvedImageKeySql, withImageUrls } from '../services/productImage.service';

// GET /partner/products/:id/inventory — the listing's current batches
export async function getInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await query(
      `SELECT pi.batch_number, pi.qty_available, pi.qty_reserved, pi.expiry_date, pi.manufactured_date,
              pi.cold_chain_confirmed, pi.is_recalled
       FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id
       WHERE pp.id = $1 AND pp.partner_id = $2 ORDER BY pi.expiry_date`, [uuid.parse(req.params.id), req.partner!.vendorId]);
    res.json({ success: true, data: { batches: rows } });
  } catch (err) { next(err); }
}

const uuid = z.string().uuid();

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const vendor = await queryOne(
      `SELECT v.id, v.name, v.gst_number, v.drug_license_no, v.drug_license_type, v.drug_license_expiry,
              v.approval_status, v.vendor_type, v.invoice_prefix, v.pincode, v.city, v.vendor_rating,
              COALESCE(r.commission_pct, 8) AS commission_pct, COALESCE(r.finding_fee_paise, 1500) AS finding_fee_paise
       FROM vendors v LEFT JOIN partner_commission_rates r ON r.partner_id = v.id
       WHERE v.id = $1`, [req.partner!.vendorId]);
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
}

// Catalogue search to pick what to list (Dawabag's product master)
export async function searchCatalogue(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.string().trim().min(2).max(100).parse(req.query.q);
    const rows = await query(
      `SELECT p.id, p.name, p.generic_name, p.sku, p.drug_schedule, p.mrp_paise, p.offer_price_paise,
              p.ptr_price_paise, p.pts_price_paise, p.institutional_price_paise, p.cold_chain,
              ${approvedImageKeySql()} AS approved_image_key,
              EXISTS (SELECT 1 FROM partner_products pp WHERE pp.partner_id = $2 AND pp.product_id = p.id) AS already_listed
       FROM products p
       WHERE p.is_active = TRUE AND p.deleted_at IS NULL
         AND COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')
         AND (p.name ILIKE $1 OR p.generic_name ILIKE $1 OR p.sku ILIKE $1)
       ORDER BY p.name LIMIT 30`, [`%${q}%`, req.partner!.vendorId]);
    res.json({ success: true, data: { products: await withImageUrls(rows, 'approved_image_key') } });
  } catch (err) { next(err); }
}

const listingSchema = z.object({
  product_id: uuid,
  partner_sku: z.string().max(100).optional(),
  catalogue_price_accepted: z.literal(true, { errorMap: () => ({ message: 'Accept Dawabag catalogue pricing to list' }) }),
  h1_pharmacist_name: z.string().trim().max(200).optional(),
  h1_pharmacist_reg_no: z.string().trim().max(100).optional(),
  h1_secure_storage_declared: z.boolean().optional(),
});

export async function createListing(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await submitListing(req.partner!.vendorId, req.user!.id, listingSchema.parse(req.body));
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
}

export async function getListings(req: Request, res: Response, next: NextFunction) {
  try {
    const products = (await listPartnerProducts(req.partner!.vendorId)).map((p: any) => ({
      ...p, rejection: rejectionLabel(p.rejection_reason_code),
    }));
    res.json({ success: true, data: { products } });
  } catch (err) { next(err); }
}

const batchesSchema = z.object({
  batches: z.array(z.object({
    batch_number: z.string().trim().min(1).max(100),
    qty_available: z.number().int().min(0).max(1_000_000),
    expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    manufactured_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    cold_chain_confirmed: z.boolean().optional(),
  })).min(1).max(100),
});

export async function putInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const { batches } = batchesSchema.parse(req.body);
    const rows = await upsertInventory(req.partner!.vendorId, uuid.parse(req.params.id), batches, req.user!.id);
    res.json({ success: true, data: { batches: rows } });
  } catch (err) { next(err); }
}

export async function getShipments(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(['pending', 'packed', 'dispatched', 'delivered', 'cancelled']).optional().parse(req.query.status);
    res.json({ success: true, data: { shipments: await listPartnerShipments(req.partner!.vendorId, status) } });
  } catch (err) { next(err); }
}

export async function postDispatch(req: Request, res: Response, next: NextFunction) {
  try {
    const { courier_partner, awb_number, ...record } = dispatchSchema.parse(req.body);
    res.json({ success: true, data: await dispatchShipment(req.partner!.vendorId, uuid.parse(req.params.id), courier_partner, awb_number, req.user!.id, record) });
  } catch (err) { next(err); }
}

export async function postDelivered(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await markShipmentDelivered(uuid.parse(req.params.id), req.user!, req.partner!.vendorId, handoverSchema.parse(req.body ?? {})) });
  } catch (err) { next(err); }
}

export async function getMySettlements(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: { settlements: await listSettlements({ partnerId: req.partner!.vendorId }) } });
  } catch (err) { next(err); }
}

export async function getMySettlement(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getSettlement(uuid.parse(req.params.id), req.partner!.vendorId) });
  } catch (err) { next(err); }
}

// Returns on this partner's shipments; each approved one is deducted at settlement (C-37)
export async function getMyReturns(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { returns: await listReturns({ partnerId: req.partner!.vendorId }) } }); } catch (err) { next(err); }
}
export async function getMyReturn(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getReturn(uuid.parse(req.params.id), { partnerId: req.partner!.vendorId }) }); } catch (err) { next(err); }
}
