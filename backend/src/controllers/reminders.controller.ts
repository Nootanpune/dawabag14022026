import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createReminder, deleteReminder, listReminders, logDose, reminderSuggestions, updateReminder, upcomingDoses,
} from '../services/reminders/reminders.service';

// "My medicines" dose reminders (Sprint 33) — the buyer's own, server-held schedule.
const id = (req: Request) => z.string().uuid().parse(req.params.id);

export async function getReminders(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listReminders(req.user!.id) }); } catch (e) { next(e); }
}

export async function getUpcomingDoses(req: Request, res: Response, next: NextFunction) {
  try {
    const { hours } = z.object({ hours: z.coerce.number().int().min(1).max(168).default(72) }).parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await upcomingDoses(req.user!.id, hours) });
  } catch (e) { next(e); }
}

export async function getReminderSuggestions(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await reminderSuggestions(req.user!.id) }); } catch (e) { next(e); }
}

export async function postReminder(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await createReminder(req.user!.id, req.body) }); } catch (e) { next(e); }
}

export async function patchReminder(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await updateReminder(req.user!.id, id(req), req.body) }); } catch (e) { next(e); }
}

export async function removeReminder(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await deleteReminder(req.user!.id, id(req)) }); } catch (e) { next(e); }
}

// POST /reminders/:id/doses { scheduled_for, status: taken | skipped }
export async function postDose(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ scheduled_for: z.string().min(10).max(40), status: z.enum(['taken', 'skipped']) }).strict().parse(req.body);
    res.json({ success: true, data: await logDose(req.user!.id, id(req), d.scheduled_for, d.status) });
  } catch (e) { next(e); }
}
