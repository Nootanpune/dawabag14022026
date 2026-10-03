// POST /orders/:id/edit — the buyer lowers quantities or removes lines before packing
// (Sprint 43, URS-074; rules in services/orderEdit/rules.ts).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { editOrder } from '../services/orderEdit/edit.service';

const editSchema = z.object({
  lines: z.array(z.object({
    order_item_id: z.string().uuid(),
    quantity: z.number().int().min(0),   // the new quantity; 0 removes the line
  })).min(1).max(100),
  reason: z.string().max(500).optional(),
});

export async function postEditOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const input = editSchema.parse(req.body);
    res.json({ success: true, data: await editOrder(req.user!.id, req.params.id, input) });
  } catch (err) { next(err); }
}
