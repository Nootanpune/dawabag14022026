// src/controllers/shopping.controller.ts — cart suggestions (Sprint 25). Only
// suggestions: nothing here changes the server cart; the buyer adds with PUT /cart/items.
import { Request, Response, NextFunction } from 'express';
import { buyAgain } from '../services/shopping/buyAgain.service';
import { cheaperOptions } from '../services/shopping/cheaperOption.service';

// GET /cart/buy-again — medicines from the buyer's delivered orders not in the cart (C-10 applied)
export async function getBuyAgain(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: { products: await buyAgain(req.user!.id, req.user!.pricing_type) } });
  } catch (err) { next(err); }
}

// GET /cart/cheaper-options — same medicine (generic name and strength), lower price, per cart line
export async function getCheaperOptions(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: { options: await cheaperOptions(req.user!.id, req.user!.pricing_type) } });
  } catch (err) { next(err); }
}
