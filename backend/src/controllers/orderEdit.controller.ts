// POST /orders/:id/edit — the buyer changes the order before the pharmacist's approval
// (Sprint 44, owner decision CONFIRMED 2026-10-03; rules in services/orderEdit/rules.ts):
// lower / remove / raise existing lines (lines: new quantity, 0 removes) and add medicines
// (add). New or raised prescription medicines need prescription_id (C-08); a doctor /
// institution adding anything needs written_order_id (Drugs Rules r.65(9)(b)).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { editOrder } from '../services/orderEdit/edit.service';

const editSchema = z.object({
  lines: z.array(z.object({
    order_item_id: z.string().uuid(),
    quantity: z.number().int().min(0),   // the new quantity; 0 removes the line, more raises it
  })).max(100).optional().default([]),
  add: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).max(50).optional().default([]),
  prescription_id: z.string().uuid().optional(),
  written_order_id: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
}).refine((b) => b.lines.length + b.add.length > 0, 'Choose what to change');

export async function postEditOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const input = editSchema.parse(req.body);
    res.json({ success: true, data: await editOrder(req.user!.id, req.params.id, input) });
  } catch (err) { next(err); }
}
