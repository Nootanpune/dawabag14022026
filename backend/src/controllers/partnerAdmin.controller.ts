// src/controllers/partnerAdmin.controller.ts — Dawabag's admin onboards and edits
// marketplace partners (Sprint 28). Managers only (admin, super_admin): see admin.routes.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  addPartnerLogin, createPartner, getPartner, listMarketplacePartners, updatePartner,
} from '../services/partnerOnboarding/partnerAdmin.service';
import { licenceList } from '../services/licences/input';

const uuid = z.string().uuid();
const MOBILE = /^[6-9]\d{9}$/;
const text = (min: number, max: number, what: string) =>
  z.string({ required_error: `Enter ${what}` }).trim().min(min, `Enter ${what}`).max(max, `${what[0].toUpperCase()}${what.slice(1)} is too long`);
const mobile = (what: string) => z.string({ required_error: `Enter ${what}` }).trim().regex(MOBILE, `Enter ${what} as a 10-digit Indian mobile number`);

// Any drug licence form, as printed ("20", "Form 21B") or dl20…; shared with suppliers and buyers (Sprint 30)
const licences = licenceList(20);
const pharmacist = z.object({
  full_name: text(2, 200, 'the pharmacist\'s full name'),
  registration_no: text(2, 100, 'the pharmacist\'s registration number'),
  // Sprint 39: State Pharmacy Council and valid-till; both given = verified by the admin entering them
  state_council: z.string().trim().max(120).optional().nullable(),
  valid_till: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the valid-till date as YYYY-MM-DD').optional().nullable(),
});
const login = z.object({
  mobile: mobile('the login mobile'),
  full_name: z.string().trim().max(200).optional().nullable(),
  // Rules (length, letter + number, not the mobile) are checked in utils/passwordPolicy
  temporary_password: z.string({ required_error: 'Enter a temporary password' }).max(200),
});

const details = {
  legal_name: text(2, 255, 'the legal name (as on the GST certificate)'),
  trade_name: z.string().trim().max(255).optional().nullable(),
  gstin: text(1, 30, 'the GSTIN'),   // length, shape and check character: utils/gstin (plain reasons)
  contact_name: text(2, 255, 'the contact person'),
  contact_mobile: mobile('the contact mobile'),
  contact_email: z.union([z.string().trim().email('Enter a valid email address'), z.literal('')]).optional().nullable(),
  address_line1: text(5, 500, 'the shop address'),
  address_line2: z.string().trim().max(500).optional().nullable(),
  city: text(2, 100, 'the city'),
  state: text(2, 100, 'the state'),
  pincode: z.string({ required_error: 'Enter the PIN code' }).trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code'),
  latitude: z.number().min(6).max(38).optional().nullable(),
  longitude: z.number().min(68).max(98).optional().nullable(),
  invoice_prefix: z.string({ required_error: 'Enter an invoice prefix' }).trim().transform((s) => s.toUpperCase()),
};

const createSchema = z.object({
  ...details,
  licences,
  pharmacists: z.array(pharmacist).max(20),
  logins: z.array(login).min(1, 'Add at least one partner login (mobile number)').max(10),
});
const updateSchema = z.object(details).partial().extend({
  licences: licences.optional(),
  pharmacists: z.array(pharmacist).max(20).optional(),
});

// GET /admin/partners
export async function getPartners(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: { partners: await listMarketplacePartners() } });
  } catch (err) { next(err); }
}

// GET /admin/partners/:vendorId
export async function getPartnerDetail(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getPartner(uuid.parse(req.params.vendorId)) });
  } catch (err) { next(err); }
}

// POST /admin/partners — partner, licences, pharmacists and logins in one transaction
export async function postPartner(req: Request, res: Response, next: NextFunction) {
  try {
    const d = createSchema.parse(req.body);
    const result = await createPartner(req.user!.id, d, req.ip);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// PUT /admin/partners/:vendorId
export async function putPartner(req: Request, res: Response, next: NextFunction) {
  try {
    const d = updateSchema.parse(req.body);
    res.json({ success: true, data: await updatePartner(req.user!.id, uuid.parse(req.params.vendorId), d, req.ip) });
  } catch (err) { next(err); }
}

// POST /admin/partners/:vendorId/logins
export async function postPartnerLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const d = login.parse(req.body);
    const result = await addPartnerLogin(req.user!.id, uuid.parse(req.params.vendorId), d);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}
