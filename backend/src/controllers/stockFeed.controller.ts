// src/controllers/stockFeed.controller.ts — Sprint 37: the live stock feed in the
// partner portal (status, items to check and the decisions on them) and for Dawabag's
// admins (mode switch and staleness settings per partner, urgent counts, read-only
// check list). Request parsing only; rules in services/partnerLiveFeed.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { acceptCheck, CHECK_STATUSES, dismissCheck, linkCheck, listChecks, requestProductForCheck } from '../services/partnerLiveFeed/checks.service';
import { adminFeedAlerts, feedStatus, partnerAlerts } from '../services/partnerLiveFeed/alerts.service';
import { updateFeedSettings } from '../services/partnerLiveFeed/settings.service';

const uuid = z.string().uuid();
const statusQuery = z.object({ status: z.enum(CHECK_STATUSES).default('open') });
const acceptBody = z.object({
  cold_chain_confirmed: z.boolean().optional(),
  catalogue_price_accepted: z.boolean().optional(),
  h1_pharmacist_name: z.string().trim().max(200).optional(),
  h1_pharmacist_reg_no: z.string().trim().max(100).optional(),
  h1_secure_storage_declared: z.boolean().optional(),
}).strict();
const linkBody = z.object({ product_id: z.string().uuid() }).strict();
const dismissBody = z.object({ reason: z.string().trim().min(3, 'Say why (at least 3 characters)').max(300) }).strict();

// ── Partner portal: /partner/stock-feed ─────────────────────────────────────
const partnerOf = (req: Request) => req.partner!.vendorId;

export async function getPartnerFeed(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await feedStatus(partnerOf(req)) }); } catch (e) { next(e); }
}
export async function getPartnerFeedAlerts(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await partnerAlerts(partnerOf(req)) }); } catch (e) { next(e); }
}
export async function getPartnerChecks(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = statusQuery.parse(req.query);
    res.json({ success: true, data: { checks: await listChecks(partnerOf(req), status) } });
  } catch (e) { next(e); }
}
export async function postAcceptCheck(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await acceptCheck(partnerOf(req), uuid.parse(req.params.id), req.user!.id, acceptBody.parse(req.body ?? {})) });
  } catch (e) { next(e); }
}
export async function postLinkCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const { product_id } = linkBody.parse(req.body ?? {});
    res.json({ success: true, data: await linkCheck(partnerOf(req), uuid.parse(req.params.id), req.user!.id, product_id) });
  } catch (e) { next(e); }
}
export async function postRequestCheck(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await requestProductForCheck(partnerOf(req), uuid.parse(req.params.id), req.user!.id) }); } catch (e) { next(e); }
}
export async function postDismissCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = dismissBody.parse(req.body ?? {});
    res.json({ success: true, data: await dismissCheck(partnerOf(req), uuid.parse(req.params.id), req.user!.id, reason) });
  } catch (e) { next(e); }
}

// ── Admin: /admin/stock-feeds, /admin/partners/:vendorId/stock-feed ─────────
const settingsBody = z.object({
  mode: z.enum(['manual', 'live']).optional(),
  stale_after_minutes: z.number().int().min(2).max(1440).optional(),
  stale_policy: z.enum(['hide', 'margin']).optional(),
  stale_margin_pct: z.number().int().min(1).max(99).optional(),
  billing_grace_minutes: z.number().int().min(0).max(240).optional(),
}).strict();

export async function getAdminFeedAlerts(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await adminFeedAlerts() }); } catch (e) { next(e); }
}
export async function getAdminChecks(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = statusQuery.parse(req.query);
    const partner = req.query.partner_id ? uuid.parse(req.query.partner_id) : null;
    res.json({ success: true, data: { checks: await listChecks(partner, status) } });
  } catch (e) { next(e); }
}
export async function getAdminPartnerFeed(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await feedStatus(uuid.parse(req.params.vendorId)) }); } catch (e) { next(e); }
}
export async function putAdminPartnerFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.vendorId);
    await updateFeedSettings(id, req.user!.id, settingsBody.parse(req.body ?? {}));
    res.json({ success: true, data: await feedStatus(id) });
  } catch (e) { next(e); }
}
