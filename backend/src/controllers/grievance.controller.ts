// src/controllers/grievance.controller.ts — buyer complaints and staff handling (Rulebook C-36)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { addMessage, createGrievance, getGrievance, listGrievances, setStatus } from '../services/grievance.service';
import { legalInfo } from '../services/legal.service';

const uuid = z.string().uuid();
const CATEGORIES = ['order', 'delivery', 'product_quality', 'refund', 'prescription', 'privacy', 'pricing', 'other'] as const;
const STAFF = ['admin', 'super_admin', 'pharmacist_rx'];

const isStaff = (req: Request) => STAFF.includes(req.user!.role);

export async function getLegalInfo(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await legalInfo() }); } catch (err) { next(err); }
}

export async function postGrievance(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      category: z.enum(CATEGORIES),
      subject: z.string().trim().min(3).max(200),
      description: z.string().trim().min(10).max(5000),
      order_id: uuid.optional(),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await createGrievance(req.user!.id, d) });
  } catch (err) { next(err); }
}

export async function getMyGrievances(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { grievances: await listGrievances({ userId: req.user!.id }) } }); } catch (err) { next(err); }
}

export async function getOneGrievance(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    res.json({ success: true, data: await getGrievance(id, isStaff(req) ? undefined : req.user!.id) });
  } catch (err) { next(err); }
}

export async function postGrievanceMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { body } = z.object({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
    await addMessage(uuid.parse(req.params.id), req.user!.id, body, isStaff(req));
    res.status(201).json({ success: true, data: await getGrievance(req.params.id, isStaff(req) ? undefined : req.user!.id) });
  } catch (err) { next(err); }
}

// Staff
export async function getAllGrievances(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.object({
      status: z.enum(['open', 'acknowledged', 'in_progress', 'resolved', 'closed']).optional(),
      overdue: z.enum(['true', 'false']).optional(),
    }).parse(req.query);
    res.json({ success: true, data: { grievances: await listGrievances({ status: q.status, overdueOnly: q.overdue === 'true' }) } });
  } catch (err) { next(err); }
}

export async function patchGrievanceStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      status: z.enum(['in_progress', 'resolved', 'closed']),
      resolution: z.string().trim().min(3).max(5000).optional(),
    }).parse(req.body);
    res.json({ success: true, data: await setStatus(uuid.parse(req.params.id), req.user!.id, d.status, d.resolution) });
  } catch (err) { next(err); }
}
