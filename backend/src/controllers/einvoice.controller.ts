// src/controllers/einvoice.controller.ts — e-invoice exceptions and retries (C-31)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { listEinvoices, retryEinvoice } from '../services/einvoice/einvoice.service';

// GET /einvoices?status=pending|generated|failed|cancelled
export async function getEinvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = z.object({ status: z.enum(['pending', 'generated', 'failed', 'cancelled']).optional() }).parse(req.query);
    res.json({ success: true, data: await listEinvoices(status) });
  } catch (e) { next(e); }
}

// POST /einvoices/:id/retry — after the data (GSTIN, PIN code, settings) is fixed
export async function postRetryEinvoice(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await retryEinvoice(req.user!.id, z.string().uuid().parse(req.params.id)) }); } catch (e) { next(e); }
}
