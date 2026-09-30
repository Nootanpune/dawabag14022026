// src/controllers/marketplaceAdmin.controller.ts — admin side of the marketplace
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAudit, writeAuditTx } from '../utils/audit';
import { approveListing, postLive, rejectListing, reviewQueue } from '../services/partnerListing.service';
import { markShipmentDelivered } from '../services/partnerFulfilment.service';
import { generateSettlements, getSettlement, listSettlements, markSettlementPaid } from '../services/settlement.service';
import { listSettings } from '../services/settings.service';
import { REJECTION_CODES } from '../utils/rejectionCodes';

export async function getRejectionCodes(_req: Request, res: Response) {
  res.json({ success: true, data: { codes: Object.entries(REJECTION_CODES).map(([code, v]) => ({ code, ...v })) } });
}

// GET /admin/partners — approved marketplace partners with their commission terms
export async function listPartners(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await query(
      `SELECT v.id, v.name, v.pincode, v.city, v.invoice_prefix, v.vendor_rating, v.gst_number, v.drug_license_expiry,
              COALESCE(r.commission_pct, 8) AS commission_pct, COALESCE(r.finding_fee_paise, 1500) AS finding_fee_paise,
              (SELECT json_agg(json_build_object('user_id', vu.user_id, 'mobile', u.mobile)) FROM vendor_users vu
                 JOIN users u ON u.id = vu.user_id WHERE vu.vendor_id = v.id) AS logins
       FROM vendors v LEFT JOIN partner_commission_rates r ON r.partner_id = v.id
       WHERE v.approval_status = 'approved' AND v.vendor_type IN ('marketplace_partner', 'both')
       ORDER BY v.name`);
    res.json({ success: true, data: { partners: rows } });
  } catch (err) { next(err); }
}

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// POST /admin/partners/:vendorId/users { mobile } — give an existing login partner access
export async function linkPartnerUser(req: Request, res: Response, next: NextFunction) {
  try {
    const vendorId = uuid.parse(req.params.vendorId);
    const { mobile } = z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/) }).parse(req.body);
    const result = await withTransaction(async (client) => {
      const v = (await client.query(`SELECT id, vendor_type FROM vendors WHERE id = $1`, [vendorId])).rows[0];
      if (!v) throw new AppError('Partner not found', 404);
      if (!['marketplace_partner', 'both'].includes(v.vendor_type)) throw new AppError('Vendor is not a marketplace partner', 400);
      const u = (await client.query(
        `SELECT id, role, customer_type FROM users WHERE mobile = $1 AND deleted_at IS NULL FOR UPDATE`, [mobile])).rows[0];
      if (!u) throw new AppError('No account with that mobile — ask the partner to register first', 404);
      if (u.role !== 'customer' && u.role !== 'partner') throw new AppError('Staff accounts cannot be partner logins', 400);
      if (u.customer_type !== 'customer') throw new AppError('Use a separate login for the partner, not a buyer account', 400);
      await client.query(`UPDATE users SET role = 'partner', updated_at = NOW() WHERE id = $1`, [u.id]);
      await client.query(
        `INSERT INTO vendor_users (vendor_id, user_id, created_by) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`, [vendorId, u.id, req.user!.id]);
      await writeAuditTx(client, { userId: u.id, action: 'partner_user_linked', performedBy: req.user!.id, newValue: { vendor_id: vendorId } });
      return { vendor_id: vendorId, user_id: u.id };
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// PUT /admin/partners/:vendorId/commission { commission_pct, finding_fee_paise }
export async function setCommission(req: Request, res: Response, next: NextFunction) {
  try {
    const vendorId = uuid.parse(req.params.vendorId);
    const d = z.object({
      commission_pct: z.number().min(0).max(50),
      finding_fee_paise: z.number().int().min(0).max(100000),
    }).parse(req.body);
    await query(
      `INSERT INTO partner_commission_rates (partner_id, commission_pct, finding_fee_paise, agreed_by_admin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (partner_id) DO UPDATE SET commission_pct = EXCLUDED.commission_pct,
         finding_fee_paise = EXCLUDED.finding_fee_paise, agreed_by_admin = EXCLUDED.agreed_by_admin, agreed_at = NOW()`,
      [vendorId, d.commission_pct, d.finding_fee_paise, req.user!.id]);
    await writeAudit({ userId: null, action: 'partner_commission_set', performedBy: req.user!.id, newValue: { vendor_id: vendorId, ...d } });
    res.json({ success: true, data: d });
  } catch (err) { next(err); }
}

// ── Listing review (tasks 18, 22) ──
export async function getReviewQueue(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { products: await reviewQueue() } }); } catch (err) { next(err); }
}
export async function postApproveListing(req: Request, res: Response, next: NextFunction) {
  try { await approveListing(uuid.parse(req.params.id), req.user!.id); res.json({ success: true, data: { approval_status: 'approved' } }); }
  catch (err) { next(err); }
}
export async function postRejectListing(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ rejection_reason_code: z.enum(Object.keys(REJECTION_CODES) as [string, ...string[]]), rejection_details: z.string().max(1000).optional() }).parse(req.body);
    await rejectListing(uuid.parse(req.params.id), d.rejection_reason_code, d.rejection_details, req.user!.id);
    res.json({ success: true, data: { approval_status: 'rejected' } });
  } catch (err) { next(err); }
}
export async function postListingLive(req: Request, res: Response, next: NextFunction) {
  try { await postLive(uuid.parse(req.params.id), req.user!.id); res.json({ success: true, data: { listing_status: 'live' } }); }
  catch (err) { next(err); }
}

// ── Shipments ──
export async function postShipmentDelivered(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await markShipmentDelivered(uuid.parse(req.params.id), req.user!.id) }); }
  catch (err) { next(err); }
}

// ── Settlements (task 20) ──
export async function postGenerateSettlements(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ period_from: date, period_to: date }).parse(req.body);
    res.json({ success: true, data: await generateSettlements(d.period_from, d.period_to, req.user!.id) });
  } catch (err) { next(err); }
}
export async function getSettlements(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(['pending', 'processed', 'paid', 'disputed', 'on_hold']).optional().parse(req.query.status);
    res.json({ success: true, data: { settlements: await listSettlements({ status }) } });
  } catch (err) { next(err); }
}
export async function getSettlementDetail(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getSettlement(uuid.parse(req.params.id)) }); } catch (err) { next(err); }
}
export async function postSettlementPaid(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ payment_mode: z.enum(['NEFT', 'RTGS', 'IMPS', 'UPI']), utr_reference: z.string().trim().min(6).max(50) }).parse(req.body);
    res.json({ success: true, data: await markSettlementPaid(uuid.parse(req.params.id), d.payment_mode, d.utr_reference, req.user!.id) });
  } catch (err) { next(err); }
}

// ── Settings (server-held business rules) ──
const SETTING_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'allocation.own_first_min_order_paise': z.number().int().min(0),
  'allocation.own_first_max_delivery_hours': z.number().int().min(1).max(240),
  'dawabag.premises': z.object({ pincode: z.string().regex(/^\d{6}$/), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  'marketplace.tcs_pct': z.number().min(0).max(5),
  'marketplace.tds_pct': z.number().min(0).max(5),
  'marketplace.fee_gst_pct': z.number().min(0).max(28),
  'refill.reminder_days_before': z.number().int().min(1).max(14),
};

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { settings: await listSettings() } }); } catch (err) { next(err); }
}
export async function putSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = SETTING_SCHEMAS[req.params.key];
    if (!schema) throw new AppError('Unknown setting', 404);
    const value = schema.parse(req.body.value);
    const before = await queryOne<{ value: unknown }>('SELECT value FROM app_settings WHERE key = $1', [req.params.key]);
    await query(`UPDATE app_settings SET value = $2, updated_by = $3, updated_at = NOW() WHERE key = $1`,
      [req.params.key, JSON.stringify(value), req.user!.id]);
    await writeAudit({ userId: null, action: 'setting_changed', performedBy: req.user!.id,
      oldValue: { key: req.params.key, value: before?.value }, newValue: { key: req.params.key, value } });
    res.json({ success: true, data: { key: req.params.key, value } });
  } catch (err) { next(err); }
}
