// src/controllers/compliance.controller.ts — side-effect reports (C-29) and licence register (C-07)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OUTCOMES, SERIOUSNESS, createAdr, getAdr, listAdr, reviewAdr } from '../services/adverseEvent.service';
import { LICENCE_TYPES, listLicences, saveLicence } from '../services/licence.service';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function postAdr(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      product_id: uuid, order_id: uuid.optional(), batch_number: z.string().trim().max(100).optional(),
      patient_initials: z.string().trim().min(1).max(10),
      patient_age_years: z.number().int().min(0).max(120).optional(),
      patient_gender: z.enum(['male', 'female', 'other']).optional(),
      reaction: z.string().trim().min(10).max(5000), onset_date: date.optional(),
      seriousness: z.enum(SERIOUSNESS), outcome: z.enum(OUTCOMES).optional(),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await createAdr(req.user!.id, d) });
  } catch (e) { next(e); }
}
export async function getMyAdr(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { reports: await listAdr({ userId: req.user!.id }) } }); } catch (e) { next(e); }
}
export async function getOneAdr(req: Request, res: Response, next: NextFunction) {
  try {
    const staff = ['pharmacist_rx', 'admin', 'super_admin'].includes(req.user!.role);
    res.json({ success: true, data: await getAdr(uuid.parse(req.params.id), staff ? undefined : req.user!.id) });
  } catch (e) { next(e); }
}
export async function getAllAdr(req: Request, res: Response, next: NextFunction) {
  try {
    const status = z.enum(['new', 'reviewed', 'forwarded', 'closed']).optional().parse(req.query.status);
    res.json({ success: true, data: { reports: await listAdr({ status }) } });
  } catch (e) { next(e); }
}
export async function patchAdr(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      status: z.enum(['reviewed', 'forwarded', 'closed']), notes: z.string().trim().min(3).max(2000),
      pvpi_reference: z.string().trim().min(3).max(100).optional(),
    }).parse(req.body);
    res.json({ success: true, data: await reviewAdr(req.user!.id, uuid.parse(req.params.id), d) });
  } catch (e) { next(e); }
}

const licenceSchema = z.object({
  licence_type: z.enum(LICENCE_TYPES), licence_number: z.string().trim().min(2).max(100),
  issued_by: z.string().trim().max(200).nullable().optional(), premises: z.string().trim().max(300).nullable().optional(),
  valid_from: date.nullable().optional(), valid_upto: date.nullable().optional(),
  renewal_owner: z.string().trim().min(2).max(100),
  renewal_owner_email: z.string().email().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(), is_active: z.boolean().optional(),
}).refine((l) => !l.valid_from || !l.valid_upto || l.valid_from <= l.valid_upto, 'valid_from must be before valid_upto');

export async function getLicences(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { licences: await listLicences() } }); } catch (e) { next(e); }
}
export async function postLicence(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await saveLicence(req.user!.id, licenceSchema.parse(req.body)) }); } catch (e) { next(e); }
}
export async function putLicence(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await saveLicence(req.user!.id, licenceSchema.parse(req.body), uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}
