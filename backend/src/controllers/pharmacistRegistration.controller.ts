// Pharmacist registration validity (Sprint 39): admins record and verify; a pharmacist
// sees where their own registration stands. Work in services/pharmacistRegistration/*.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../config/database';
import { listRegistrations, savePartnerRegistration, saveStaffRegistration } from '../services/pharmacistRegistration/registry.service';
import { staffStanding } from '../services/pharmacistRegistration/gate.service';
import { REGISTRATION_STATUSES } from '../services/pharmacistRegistration/rules';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD');
const body = z.object({
  state_council: z.string().trim().max(120).nullable().optional(),
  registration_no: z.string().trim().min(2).max(50).nullable().optional(),
  valid_till: date.nullable().optional(),
  status: z.enum(REGISTRATION_STATUSES).optional(),
  status_note: z.string().trim().max(500).nullable().optional(),
  verified: z.boolean().optional(),
});

export async function getRegistrations(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listRegistrations() }); } catch (e) { next(e); }
}

export async function putStaffRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await saveStaffRegistration(req.user!.id, z.string().uuid().parse(req.params.userId), body.parse(req.body)) });
  } catch (e) { next(e); }
}

export async function putPartnerRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const d = body.extend({ full_name: z.string().trim().min(2).max(200).optional() }).parse(req.body);
    res.json({ success: true, data: await savePartnerRegistration(req.user!.id, z.string().uuid().parse(req.params.id), d) });
  } catch (e) { next(e); }
}

// GET /pharmacist-registrations/me — the signed-in pharmacist's own standing (warning banner)
export async function getMyRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const u = await queryOne<{ pharmacist_reg_no: string | null }>('SELECT pharmacist_reg_no FROM users WHERE id = $1', [req.user!.id]);
    res.json({ success: true, data: { registration_no: u?.pharmacist_reg_no ?? null, standing: await staffStanding(pool, req.user!.id, u?.pharmacist_reg_no ?? null) } });
  } catch (e) { next(e); }
}
