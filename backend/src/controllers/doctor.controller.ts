// src/controllers/doctor.controller.ts — teleconsultation doctors and their slots (C-22)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  addSlots, blockSlot, mySlots, decideDoctor, enableDoctor, getPublicDoctor, listDoctorsForAdmin, listPublicDoctors, myProfile, openSlots, saveProfile,
} from '../services/telemedicine/doctor.service';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

export async function getDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.object({ speciality: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    res.json({ success: true, data: await listPublicDoctors(q.speciality, q.page) });
  } catch (e) { next(e); }
}
export async function getDoctor(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getPublicDoctor(uuid.parse(req.params.doctorId)) }); } catch (e) { next(e); }
}
export async function getDoctorSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const { date: d } = z.object({ date }).parse(req.query);
    res.json({ success: true, data: await openSlots(uuid.parse(req.params.doctorId), d) });
  } catch (e) { next(e); }
}
export async function putMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const p = z.object({
      full_name: z.string().trim().min(3).max(200), qualification: z.string().trim().min(2).max(200),
      council: z.string().trim().min(3).max(120), nmc_reg_number: z.string().trim().min(3).max(60),
      registration_year: z.number().int().min(1950).max(new Date().getFullYear()),
      speciality: z.string().trim().max(100).optional(), clinic_name: z.string().trim().max(200).optional(),
      consultation_fee_paise: z.number().int().min(0).max(10_000_00), bio: z.string().trim().max(2000).optional(),
      languages_spoken: z.array(z.string().trim().min(2).max(40)).max(10).optional(),
    }).parse(req.body);
    res.json({ success: true, data: await saveProfile(req.user!.id, p) });
  } catch (e) { next(e); }
}
export async function getMyProfile(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await myProfile(req.user!.id) }); } catch (e) { next(e); }
}
export async function postMySlots(req: Request, res: Response, next: NextFunction) {
  try {
    const { slots } = z.object({ slots: z.array(z.object({ slot_date: date, slot_start: time, slot_end: time })).min(1).max(200) }).parse(req.body);
    res.status(201).json({ success: true, data: await addSlots(req.user!.id, slots) });
  } catch (e) { next(e); }
}
export async function postBlockSlot(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await blockSlot(req.user!.id, uuid.parse(req.params.slotId)) }); } catch (e) { next(e); }
}
export async function postEnableDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const { mobile } = z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/) }).parse(req.body);
    res.json({ success: true, data: await enableDoctor(req.user!.id, mobile) });
  } catch (e) { next(e); }
}
export async function getDoctorsForAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = z.object({ status: z.enum(['pending', 'verified', 'rejected']).optional() }).parse(req.query);
    res.json({ success: true, data: { doctors: await listDoctorsForAdmin(status) } });
  } catch (e) { next(e); }
}
export async function postVerifyDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ approve: z.boolean(), notes: z.string().trim().min(3).max(1000), nmc_reg_number: z.string().trim().max(60).optional() })
      .refine((x) => !x.approve || !!x.nmc_reg_number, { message: 'Approving needs the registration number you checked', path: ['nmc_reg_number'] }).parse(req.body);
    res.json({ success: true, data: await decideDoctor(req.user!.id, uuid.parse(req.params.doctorId), d.approve, d.notes, d.nmc_reg_number) });
  } catch (e) { next(e); }
}
export async function getMySlots(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.object({ from: date, to: date }).parse(req.query);
    res.json({ success: true, data: await mySlots(req.user!.id, q.from, q.to) });
  } catch (e) { next(e); }
}
