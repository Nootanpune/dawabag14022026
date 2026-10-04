import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { substitutesFor } from '../services/shopping/substitutes.service';
import { deliveryEstimateFor } from '../services/productPage/delivery.service';
import { requestStanding } from '../services/buyerRestriction/standing.service';

// Product page extras (Sprint 33): substitutes and the estimated delivery date.
const productId = (req: Request) => z.string().uuid().parse(req.params.productId);

// GET /medicines/:productId/substitutes?limit= — same medicine, other makers; a list only (C-08, C-10)
export async function getSubstitutes(req: Request, res: Response, next: NextFunction) {
  try {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
    res.json({ success: true, data: await substitutesFor(productId(req), req.user?.pricing_type ?? 'customer', await requestStanding(req), limit) });
  } catch (e) { next(e); }
}

// GET /medicines/:productId/delivery?pincode= — "Get it by …", estimated; PIN typed or the saved default address
export async function getDeliveryEstimate(req: Request, res: Response, next: NextFunction) {
  try {
    const { pincode } = z.object({ pincode: z.string().trim().max(10).optional() }).parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await deliveryEstimateFor(productId(req), req.user?.pricing_type ?? 'customer',
      { pincode: pincode || undefined, userId: req.user?.id }) });
  } catch (e) { next(e); }
}
