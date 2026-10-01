// src/controllers/address.controller.ts — /users/me/addresses
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from '../services/address.service';

const uuid = z.string().uuid();
const addressSchema = z.object({
  label: z.string().trim().min(1).max(50).default('Home'),
  full_name: z.string().trim().min(2).max(255),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  address_line1: z.string().trim().min(5).max(500),
  address_line2: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  is_default: z.boolean().optional(),
});

export async function getAddresses(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listAddresses(req.user!.id) }); } catch (e) { next(e); }
}
export async function postAddress(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await createAddress(req.user!.id, addressSchema.parse(req.body)) }); } catch (e) { next(e); }
}
export async function putAddress(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await updateAddress(req.user!.id, uuid.parse(req.params.id), addressSchema.parse(req.body)) }); } catch (e) { next(e); }
}
export async function removeAddress(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await deleteAddress(req.user!.id, uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
export async function postDefaultAddress(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await setDefaultAddress(req.user!.id, uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
