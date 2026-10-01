// src/controllers/courier.controller.ts — courier booking and the tracking webhook
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { applyTrackingUpdate, bookCourier, webhookAuthorised } from '../services/courier/courier.service';

// POST /fulfilment/shipments/:id/book-courier
export async function postBookCourier(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await bookCourier(req.user!.id, z.string().uuid().parse(req.params.id)) }); } catch (e) { next(e); }
}

// POST /courier/shiprocket/webhook — Shiprocket sends the token we set in its dashboard as x-api-key
export async function postShiprocketWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!webhookAuthorised(req.get('x-api-key'))) return res.status(401).json({ success: false, message: 'Invalid webhook token' });
    const p = z.object({
      awb: z.coerce.string().min(3).max(100), current_status: z.string().min(1).max(100),
      current_timestamp: z.string().max(40).optional(),
      scans: z.array(z.object({ location: z.string().nullish() }).passthrough()).optional(),
    }).passthrough().safeParse(req.body);
    if (!p.success) return res.json({ success: true, ignored: 'unrecognised payload' });   // never make the courier retry junk
    const location = p.data.scans?.[p.data.scans.length - 1]?.location ?? undefined;
    const result = await applyTrackingUpdate({ awb: p.data.awb, current_status: p.data.current_status, current_timestamp: p.data.current_timestamp, location: location ?? undefined });
    logger.info(`Shiprocket webhook ${p.data.awb}: ${p.data.current_status} → ${JSON.stringify(result)}`);
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
}
