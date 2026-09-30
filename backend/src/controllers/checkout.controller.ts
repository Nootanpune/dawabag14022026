// src/controllers/checkout.controller.ts — POST /orders/preview (Rulebook C-35)
// The buyer sees seller, licence, charges, delivery estimate and policies before paying.
import { Request, Response, NextFunction } from 'express';
import { createOrderSchema, previewOrder } from '../services/orderPlacement.service';

export async function postCheckoutPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createOrderSchema.parse(req.body);
    res.json({ success: true, data: await previewOrder(req.user!, data) });
  } catch (err) { next(err); }
}
