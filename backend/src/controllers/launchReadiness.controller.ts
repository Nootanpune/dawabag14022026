// src/controllers/launchReadiness.controller.ts — Admin → Launch readiness (Sprint 49).
//   GET /api/v1/admin/launch-readiness                 → { checked_at, app_env, summary, sections[] }   admin, super_admin
//   PUT /api/v1/admin/launch-readiness/manual/:key     { status, note? } → the item, audited             admin, super_admin
// Computed items show counts, settings and whether a secret is SET — never its value (C-41, C-44).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { launchReadiness, manualItem } from '../services/launchReadiness/readiness.service';
import { updateManualItem } from '../services/launchReadiness/manual.service';
import { readinessFacts } from '../services/launchReadiness/facts.service';
import { READINESS_STATUSES } from '../services/launchReadiness/types';

export async function getLaunchReadiness(_req: Request, res: Response, next: NextFunction) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await launchReadiness() });
  } catch (err) { next(err); }
}

const updateSchema = z.object({
  status: z.enum(READINESS_STATUSES, { errorMap: () => ({ message: 'Choose done, in progress, not started or not needed' }) }),
  note: z.string().trim().max(1000, 'Keep the note under 1000 characters').nullish(),
});
const keySchema = z.string().regex(/^[0-9a-z.-]{1,20}$/, 'Unknown checklist item');

export async function putManualItem(req: Request, res: Response, next: NextFunction) {
  try {
    const key = keySchema.parse(req.params.key);
    const { status, note } = updateSchema.parse(req.body);
    const row = await updateManualItem(req.user!.id, key, { status, note: note ? note : null }, req.ip);
    res.json({ success: true, data: manualItem(row, await readinessFacts()) });
  } catch (err) { next(err); }
}
