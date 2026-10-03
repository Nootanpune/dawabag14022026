// src/controllers/marketplaceAdmin.controller.ts — admin side of the marketplace
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAudit, writeAuditTx } from '../utils/audit';
import { approveListing, postLive, rejectListing, reviewQueue } from '../services/partnerListing.service';
import { markShipmentDelivered } from '../services/partnerFulfilment.service';
import { handoverSchema } from './fulfilment.controller';
import { generateSettlements, getSettlement, listSettlements, markSettlementPaid } from '../services/settlement.service';
import { listSettings } from '../services/settings.service';
import { REJECTION_CODES } from '../utils/rejectionCodes';
import { WHATSAPP_TYPES, WHATSAPP_VARS } from '../services/notifications/channels/whatsapp';
import { todayIST } from '../utils/ist';

export async function getRejectionCodes(_req: Request, res: Response) {
  res.json({ success: true, data: { codes: Object.entries(REJECTION_CODES).map(([code, v]) => ({ code, ...v })) } });
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
  try { res.json({ success: true, data: await markShipmentDelivered(uuid.parse(req.params.id), req.user!, undefined, handoverSchema.parse(req.body ?? {})) }); }
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
  // Sprint 39: prescription-order payment hold (release before the gateway's own window) and partner provenance
  'payments.rx_authorisation': z.object({
    alert_after_hours: z.number().min(1).max(110),
    release_after_hours: z.number().min(2).max(118),
    gateway_expiry_minutes: z.number().int().min(1440).max(7200),
  }).refine((v) => v.alert_after_hours < v.release_after_hours, 'Alert before the release')
    .refine((v) => v.release_after_hours * 60 <= v.gateway_expiry_minutes - 120, 'Release at least 2 hours before the gateway window ends'),
  'partner_stock.provenance_required': z.boolean(),
  'allocation.own_first_min_order_paise': z.number().int().min(0),
  'allocation.own_first_max_delivery_hours': z.number().int().min(1).max(240),
  'dawabag.premises': z.object({ pincode: z.string().regex(/^\d{6}$/), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  'marketplace.tcs_pct': z.number().min(0).max(5),
  'marketplace.tds_pct': z.number().min(0).max(5),
  'marketplace.fee_gst_pct': z.number().min(0).max(28),
  'refill.reminder_days_before': z.number().int().min(1).max(14),
  // Sprint 5 — returns and delivery handover (C-37, C-26)
  'returns.report_within_hours': z.number().int().min(24).max(240),
  'returns.expiry_claim_days': z.number().int().min(7).max(90),
  'returns.near_expiry_days': z.number().int().min(30).max(365),
  'delivery.handover_code_scope': z.enum(['rx_only', 'all', 'off']),
  // Sprint 41 — approved cold-chain couriers, names separated by commas (null = not enforced; URS-105, C-25)
  'delivery.cold_chain_couriers': z.string().trim().max(500).regex(/^[^<>]*$/, 'Plain names only').nullable()
    .transform((v) => (v ? v : null)),
  // Sprint 42 — two-step sign-in for staff and partner logins (owner decision pending; C-41, C-43)
  'security.two_factor': z.enum(['optional', 'required']),
  // Sprint 20 — retail free delivery from this many paise (null = off)
  'delivery.free_above_paise': z.number().int().min(0).max(10_000_000).nullable(),
  // Sprint 4 — public legal details (C-03, C-04, C-36)
  'legal.entity': z.object({ name: z.string().min(2).max(200), address: z.string().max(500), gstin: z.string().max(15), cin: z.string().max(21) }).strict(),
  // Dawabag's drug licence numbers are edited in the licence register (Admin → Licences), not here (Sprint 30)
  'legal.pharmacist_in_charge': z.object({ name: z.string().max(200), registration_no: z.string().max(60) }).strict(),
  'legal.grievance_officer': z.object({ name: z.string().max(200), email: z.union([z.string().email(), z.literal('')]),
    phone: z.string().max(20), address: z.string().max(500) }).strict(),
  // Sprint 7 — purchasing and stock (C-16, C-28)
  'purchasing.min_shelf_life_days': z.number().int().min(30).max(730),
  'stock.near_expiry_days': z.number().int().min(15).max(365),
  // Sprint 13 — GST period lock: a past date (or null to open), never in the future
  'accounts.locked_until': z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => d < todayIST(), 'Lock only past dates').nullable(),
  // Sprint 13 — WhatsApp templates approved by Meta, per message type
  // (order and account updates only, no health details — C-41)
  'whatsapp.templates': z.record(z.enum(WHATSAPP_TYPES), z.object({
    name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/), language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
    vars: z.array(z.enum(WHATSAPP_VARS)).max(10).optional(),
  }).strict()),
  // Sprint 12 — opening stock by catalogue import closes at go-live (C-46)
  'catalogue.opening_stock_open': z.boolean(),
  // Sprint 12 — retention of operational data, at least 30 days each (C-44)
  'retention.days': z.object({
    notification_deliveries: z.number().int().min(30).max(3650), notifications: z.number().int().min(30).max(3650),
    payment_webhook_events: z.number().int().min(180).max(3650), job_runs: z.number().int().min(30).max(3650),
    abandoned_carts: z.number().int().min(30).max(3650), stale_devices: z.number().int().min(30).max(3650),
    // Sprint 34: dose reminder answers and ended reminders; health profiles of inactive accounts
    // (absent / null = kept until the buyer withdraws consent or asks for erasure)
    reminder_dose_logs: z.number().int().min(30).max(3650).optional(),
    ended_reminders: z.number().int().min(30).max(3650).optional(),
    inactive_health_profiles: z.number().int().min(365).max(3650).nullable().optional(),
  }).strict(),
  // Sprint 38 — prescriptions: kept N years after the last dispense (owner confirmed 3); purge off by default (C-34)
  'retention.prescription_years': z.number().int().min(3).max(30),
  'retention.prescription_purge': z.boolean(),
  // Sprint 9 — e-invoicing once turnover crosses the threshold (C-31)
  'einvoice.enabled': z.boolean(),
  // Sprint 8 — courier and DLT SMS templates (TRAI: only registered templates are delivered)
  'courier.provider': z.enum(['manual', 'shiprocket']),
  'courier.pickup_location': z.string().trim().min(1).max(100),
  'sms.dlt_templates': z.record(z.string().regex(/^[a-z_]{2,40}$/), z.object({
    template_id: z.string().trim().min(1).max(60),
    vars: z.record(z.string().regex(/^[A-Za-z0-9_]{1,30}$/), z.string().regex(/^[a-z_]{2,30}$/)).optional(),
  }).strict()),
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
