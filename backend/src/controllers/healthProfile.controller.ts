import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  addFamilyMember, deleteHealthProfile, getHealthProfile, healthNoteForOrder, removeFamilyMember, saveHealthProfile, updateFamilyMember,
} from '../services/healthProfile/healthProfile.service';

// Health profile (Sprint 33): consent first (C-41), deletable any time (C-43, C-44),
// seen by our pharmacists on the order they check (C-08), every look audited (C-46).
const ctx = (req: Request) => ({ ip: req.ip ?? null, agent: req.get('user-agent') ?? null });
const memberId = (req: Request) => z.string().uuid().parse(req.params.memberId);

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getHealthProfile(req.user!.id) }); } catch (e) { next(e); }
}

export async function putProfile(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await saveHealthProfile(req.user!.id, req.body, ctx(req)) }); } catch (e) { next(e); }
}

export async function deleteProfile(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await deleteHealthProfile(req.user!.id, ctx(req)) }); } catch (e) { next(e); }
}

export async function postMember(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await addFamilyMember(req.user!.id, req.body, ctx(req)) }); } catch (e) { next(e); }
}

export async function putMember(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await updateFamilyMember(req.user!.id, memberId(req), req.body, ctx(req)) }); } catch (e) { next(e); }
}

export async function deleteMember(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await removeFamilyMember(req.user!.id, memberId(req)) }); } catch (e) { next(e); }
}

// GET /health-profile/orders/:orderId — pharmacists only
export async function getOrderHealthNote(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await healthNoteForOrder(req.user!.id, z.string().uuid().parse(req.params.orderId)) });
  } catch (e) { next(e); }
}
