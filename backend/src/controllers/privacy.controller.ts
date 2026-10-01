// src/controllers/privacy.controller.ts — consents, data export, erasure/correction (C-40..C-44)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createDataRequest, exportUserData, listMyDataRequests, getConsents, handleDataRequest, listDataRequests, setMarketingConsent, setConsent,
} from '../services/privacy.service';
import { writeAudit } from '../utils/audit';

export async function getMyConsents(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getConsents(req.user!.id) }); } catch (err) { next(err); }
}

export async function putMarketingConsent(req: Request, res: Response, next: NextFunction) {
  try {
    const { granted } = z.object({ granted: z.boolean() }).parse(req.body);
    const data = await setMarketingConsent(req.user!.id, granted, req.ip || null, req.get('user-agent')?.slice(0, 500) || null);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// PUT /privacy/consents/whatsapp { granted } — order updates on WhatsApp, opt-in only
export async function putWhatsAppConsent(req: Request, res: Response, next: NextFunction) {
  try {
    const { granted } = z.object({ granted: z.boolean() }).parse(req.body);
    res.json({ success: true, data: await setConsent(req.user!.id, 'whatsapp', granted, req.ip || null, req.get('user-agent')?.slice(0, 500) || null) });
  } catch (err) { next(err); }
}

export async function getMyDataExport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await exportUserData(req.user!.id);
    await writeAudit({ userId: req.user!.id, action: 'data_exported', performedBy: req.user!.id });
    res.setHeader('Content-Disposition', 'attachment; filename="dawabag-my-data.json"');
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) { next(err); }
}

export async function postDataRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      request_type: z.enum(['erasure', 'correction']),
      details: z.string().trim().max(2000).optional(),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await createDataRequest(req.user!.id, d.request_type, d.details) });
  } catch (err) { next(err); }
}

export async function getMyDataRequests(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { requests: await listMyDataRequests(req.user!.id) } }); } catch (err) { next(err); }
}

// Admin
export async function getDataRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(['pending', 'completed', 'rejected']).optional().parse(req.query.status);
    res.json({ success: true, data: { requests: await listDataRequests(status) } });
  } catch (err) { next(err); }
}

export async function patchDataRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ action: z.enum(['complete', 'reject']), outcome: z.string().trim().min(3).max(2000) }).parse(req.body);
    res.json({ success: true, data: await handleDataRequest(req.user!.id, z.string().uuid().parse(req.params.id), d.action, d.outcome) });
  } catch (err) { next(err); }
}
