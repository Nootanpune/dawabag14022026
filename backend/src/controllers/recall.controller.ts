// src/controllers/recall.controller.ts — admin batch recalls (Rulebook C-28)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getRecall, listRecalls, recallBatch } from '../services/recall.service';

export async function postRecall(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      product_id: z.string().uuid(),
      batch_number: z.string().trim().min(1).max(100),
      reason: z.string().trim().min(5).max(2000),
      source: z.string().trim().max(100).optional(),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await recallBatch(req.user!.id, d) });
  } catch (err) { next(err); }
}

export async function getRecalls(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { recalls: await listRecalls() } }); } catch (err) { next(err); }
}

export async function getOneRecall(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getRecall(z.string().uuid().parse(req.params.id)) }); } catch (err) { next(err); }
}
