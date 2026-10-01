import { Request, Response, NextFunction } from 'express';
import { freeDeliveryAbovePaise } from '../services/delivery/freeDelivery';

// GET /api/v1/delivery/offer — public: the free-delivery amount the owner set
// (app_settings 'delivery.free_above_paise'), or null when it is off. The home
// pages show it; they never keep it, and nobody may cache it, so a change in
// Settings shows at once. It must match the published shipping policy (C-39).
export async function getDeliveryOffer(_req: Request, res: Response, next: NextFunction) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { free_delivery_above_paise: await freeDeliveryAbovePaise() } });
  } catch (err) {
    next(err);
  }
}
