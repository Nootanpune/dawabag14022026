// src/controllers/cart.controller.ts — server-side cart (single source of truth)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { clearCart, getCart, setCartCoupon, setCartItem } from '../services/cart.service';

// GET /cart
export async function getMyCart(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getCart(req.user!.id, req.user!.pricing_type) });
  } catch (err) { next(err); }
}

// PUT /cart/items/:productId  { quantity }   (0 removes the line)
export async function putCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = z.string().uuid().parse(req.params.productId);
    const { quantity } = z.object({ quantity: z.number().int().min(0).max(9999) }).parse(req.body);
    await setCartItem(req.user!.id, productId, quantity, req.user!.pricing_type);
    res.json({ success: true, data: await getCart(req.user!.id, req.user!.pricing_type) });
  } catch (err) { next(err); }
}

// PUT /cart/coupon  { code }   (null or '' removes it)
export async function putCartCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = z.object({ code: z.string().max(50).nullable().optional() }).parse(req.body);
    await setCartCoupon(req.user!.id, code || null, req.user!.pricing_type);
    res.json({ success: true, data: await getCart(req.user!.id, req.user!.pricing_type) });
  } catch (err) { next(err); }
}

// DELETE /cart
export async function deleteMyCart(req: Request, res: Response, next: NextFunction) {
  try {
    await clearCart(req.user!.id);
    res.json({ success: true, data: await getCart(req.user!.id, req.user!.pricing_type) });
  } catch (err) { next(err); }
}
