// src/controllers/recallAlert.controller.ts — regulator recall / NSQ alerts (Rulebook C-28)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { clearMatch, clearProductForLine, createAlert, getAlert, listAlerts, recallMatch } from '../services/recallAlerts/alert.service';
import { MAX_ALERT_LINES, parseAlertFile } from '../services/recallAlerts/parse';

const uuid = z.string().uuid();
const header = z.object({
  source: z.enum(['cdsco_nsq', 'fda_maharashtra', 'manufacturer', 'other']),
  reference: z.string().trim().min(3).max(200),
  received_at: z.string().datetime({ offset: true }),
});
const line = z.object({
  drug_name: z.string().trim().min(2).max(300),
  batch_number: z.string().trim().min(1).max(100),
  manufacturer: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(2000).optional(),
});
const notes = z.object({ notes: z.string().trim().min(5).max(2000) });

// POST /recalls/alerts — lines typed in (an FDA email, a manufacturer letter)
export async function postAlert(req: Request, res: Response, next: NextFunction) {
  try {
    const d = header.extend({ lines: z.array(line).min(1).max(MAX_ALERT_LINES) }).parse(req.body);
    res.status(201).json({ success: true, data: await createAlert(req.user!.id, d) });
  } catch (err) { next(err); }
}

// POST /recalls/alerts/import — multipart: file (.xlsx/.csv) + source, reference, received_at
export async function postAlertImport(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) throw new AppError('Attach the alert list (.xlsx or .csv)', 400);
    const h = header.parse(req.body);
    const lines = z.array(line).parse(await parseAlertFile(file.buffer, file.originalname));
    res.status(201).json({ success: true, data: await createAlert(req.user!.id, { ...h, lines }) });
  } catch (err) { next(err); }
}

export async function getAlerts(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { alerts: await listAlerts(req.query.open === 'true') } }); } catch (err) { next(err); }
}

export async function getOneAlert(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getAlert(uuid.parse(req.params.id)) }); } catch (err) { next(err); }
}

export async function postRecallMatch(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await recallMatch(req.user!.id, uuid.parse(req.params.id)) }); } catch (err) { next(err); }
}

export async function postClearMatch(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await clearMatch(req.user!.id, uuid.parse(req.params.id), notes.parse(req.body).notes) }); } catch (err) { next(err); }
}

export async function postClearLineProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const d = notes.extend({ product_id: uuid }).parse(req.body);
    res.status(201).json({ success: true, data: await clearProductForLine(req.user!.id, uuid.parse(req.params.id), d.product_id, d.notes) });
  } catch (err) { next(err); }
}
