// src/controllers/partner.controller.ts — partner portal (role 'partner')
import { getReturn, listReturns } from '../services/return.service';
import { dispatchSchema, handoverSchema } from './fulfilment.controller';
import { Request, Response, NextFunction } from 'express';
import { assertManualStock } from '../services/partnerLiveFeed/settings.service';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { listPartnerProducts, submitListing, upsertInventory } from '../services/partnerListing.service';
import { normaliseProvenance } from '../services/partnerProvenance/rules';
import { addPortalProvenance, listProvenance } from '../services/partnerProvenance/provenance.service';
import { todayIST } from '../utils/ist';
import { AppError } from '../utils/AppError';
import { dispatchShipment, listPartnerShipments, markShipmentDelivered } from '../services/partnerFulfilment.service';
import { decidePartnerShipment, partnerPharmacists } from '../services/pharmacistCheck/partner.service';
import { getSettlement, listSettlements } from '../services/settlement.service';
import { rejectionLabel } from '../utils/rejectionCodes';
import { licenceLine } from '../services/licences/forms';
import { licenceBadge, listLicences } from '../services/licences/register.service';
import { approvedImageKeySql, withImageUrls } from '../services/productImage.service';

// GET /partner/products/:id/inventory — the listing's current batches
export async function getInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await query(
      `SELECT pi.batch_number, pi.qty_available, pi.qty_reserved, pi.expiry_date, pi.manufactured_date,
              pi.cold_chain_confirmed, pi.is_recalled,
              -- Sprint 39: the batch's supplier details, read-only once recorded (C-02)
              pb.supplier_name, pb.supplier_licence_no, pb.supplier_invoice_no,
              to_char(pb.supplier_invoice_date, 'YYYY-MM-DD') AS supplier_invoice_date, (pb.id IS NOT NULL) AS provenance_recorded
       FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id
       LEFT JOIN partner_batch_provenance pb ON pb.partner_inventory_id = pi.id
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
              COALESCE(r.commission_pct, 8) AS commission_pct, COALESCE(r.finding_fee_paise, 1500) AS finding_fee_paise,
              -- Sprint 36: the owner login manages the stock-feed API keys
              COALESCE((SELECT vu.is_owner FROM vendor_users vu WHERE vu.vendor_id = v.id AND vu.user_id = $2), FALSE) AS is_owner
       FROM vendors v LEFT JOIN partner_commission_rates r ON r.partner_id = v.id
       WHERE v.id = $1`, [req.partner!.vendorId, req.user!.id]);
    // "Your drug licences" (Sprint 30): every licence, renewals waiting for Dawabag's check
    const licences = await listLicences({ vendorId: req.partner!.vendorId });
    res.json({ success: true, data: { ...vendor, licences, licence_line: licenceLine(licences.filter((l) => l.status === 'verified')),
      ...licenceBadge(licences) } });
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
              p.online_sale_status,   -- Sprint 39: listing is allowed, sale only once a pharmacist permits it (C-10)
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
    // Sprint 39: optional supplier details of the batch (required for H1 / cold chain when the setting is on)
    supplier_name: z.string().trim().max(255).nullable().optional(),
    supplier_licence_no: z.string().trim().max(100).nullable().optional(),
    supplier_invoice_no: z.string().trim().max(100).nullable().optional(),
    supplier_invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the purchase invoice date as YYYY-MM-DD').nullable().optional(),
  })).min(1).max(100),
});

export async function putInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const { batches } = batchesSchema.parse(req.body);
    await assertManualStock(req.partner!.vendorId);   // Sprint 37: live feed = the software is the only authority
    const today = todayIST();
    const withProvenance = batches.map(({ supplier_name, supplier_licence_no, supplier_invoice_no, supplier_invoice_date, ...b }) => {
      const n = normaliseProvenance({ supplier_name, supplier_licence_no, supplier_invoice_no, supplier_invoice_date }, today);
      if (n.warnings.length) throw new AppError(`Batch ${b.batch_number}: ${n.warnings[0]}`, 400);
      return { ...b, provenance: n.provenance };
    });
    const rows = await upsertInventory(req.partner!.vendorId, uuid.parse(req.params.id), withProvenance, req.user!.id);
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

// Sprint 35: the partner's own registered pharmacist checks and releases each shipment (C-08)
export async function getPharmacists(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { pharmacists: await partnerPharmacists(req.partner!.vendorId) } }); } catch (err) { next(err); }
}

export async function postCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const input = z.object({
      decision: z.enum(['release', 'hold', 'reject']),
      vendor_pharmacist_id: uuid,
      reason: z.string().trim().max(500).optional(),
    }).parse(req.body);
    res.json({ success: true, data: await decidePartnerShipment(req.partner!.vendorId, req.user!.id, uuid.parse(req.params.id), input) });
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

// GET /partner/batch-provenance — the partner's own batches and who supplied them (Sprint 39, C-02)
export async function getMyBatchProvenance(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({ q: z.string().max(100).optional(), batch: z.string().max(100).optional(), missing: z.enum(['1', 'true']).optional() }).parse(req.query);
    res.json({ success: true, data: { batches: await listProvenance({ partnerId: req.partner!.vendorId, q: f.q, batch: f.batch, missingOnly: !!f.missing }) } });
  } catch (err) { next(err); }
}

// Sprint 40: add supplier details to one of the partner's batches that has none (then read-only, C-02, C-34)
export async function postMyBatchProvenance(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = z.object({
      supplier_name: z.string().trim().max(255).nullable().optional(),
      supplier_licence_no: z.string().trim().max(100).nullable().optional(),
      supplier_invoice_no: z.string().trim().max(100).nullable().optional(),
      supplier_invoice_date: z.string().trim().max(30).nullable().optional(),
    }).strict().parse(req.body ?? {});
    const n = normaliseProvenance(raw, todayIST());
    if (n.warnings.length) throw new AppError(n.warnings[0], 400);
    if (!n.provenance) throw new AppError('Enter at least the supplier name or the purchase invoice number', 400);
    res.status(201).json({ success: true, data: await addPortalProvenance(req.partner!.vendorId, uuid.parse(req.params.inventoryId), n.provenance, req.user!.id) });
  } catch (err) { next(err); }
}
