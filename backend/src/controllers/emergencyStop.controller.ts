// src/controllers/emergencyStop.controller.ts — the emergency stop for prescription-
// medicine sales (owner decision 2026-10-03; Sprint 38; C-08, C-46).
//   Public:      GET  /api/v1/sales-status            → { rx_sales: 'open' | 'paused', message, reference, since }
//   Super-admin: GET  /api/v1/admin/emergency-stop    → state (with the internal reason) + history
//                POST /api/v1/admin/emergency-stop/pause  { reason, reference, public_message?, confirm: 'PAUSE' }
//                POST /api/v1/admin/emergency-stop/resume { note?, confirm: 'RESUME' }
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getRxPause, pauseHistory, pauseRxSales, resumeRxSales } from '../services/emergencyStop/state.service';
import { customerMessage, publicStatus } from '../services/emergencyStop/rules';

export async function getSalesStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    res.setHeader('Cache-Control', 'no-store');   // always the server's current answer
    res.json({ success: true, data: publicStatus(await getRxPause()) });
  } catch (err) { next(err); }
}

export async function getEmergencyStop(_req: Request, res: Response, next: NextFunction) {
  try {
    const state = await getRxPause();
    res.json({ success: true, data: { state, public: publicStatus(state), history: await pauseHistory() } });
  } catch (err) { next(err); }
}

const pauseSchema = z.object({
  reason: z.string().trim().min(10, 'Say why sales are paused (at least 10 characters)').max(500),
  reference: z.string().trim().min(3, 'Enter the reference, e.g. the notification number').max(120),
  public_message: z.string().trim().min(10).max(300).optional(),
  confirm: z.literal('PAUSE', { errorMap: () => ({ message: 'Type PAUSE to confirm' }) }),
});
const resumeSchema = z.object({
  note: z.string().trim().max(500).optional(),
  confirm: z.literal('RESUME', { errorMap: () => ({ message: 'Type RESUME to confirm' }) }),
});

export async function postPause(req: Request, res: Response, next: NextFunction) {
  try {
    const { confirm: _c, ...input } = pauseSchema.parse(req.body);
    const state = await pauseRxSales(req.user!.id, input, req.ip);
    res.json({ success: true, data: { state, public: publicStatus(state), message: `Paused. Buyers now see: “${customerMessage(state)}”` } });
  } catch (err) { next(err); }
}

export async function postResume(req: Request, res: Response, next: NextFunction) {
  try {
    const { note } = resumeSchema.parse(req.body);
    const state = await resumeRxSales(req.user!.id, note, req.ip);
    res.json({ success: true, data: { state, public: publicStatus(state) } });
  } catch (err) { next(err); }
}
