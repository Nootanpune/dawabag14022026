// Self-inspection register (Sprint 40; O15; C-34). Rules in services/selfInspection/rules.ts.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ACTION_STATUSES, FREQUENCIES, RESULTS } from '../services/selfInspection/rules';
import {
  actionOwners, changeActionStatus, getInspection, listActions, listInspections, listTemplates, recordInspection, saveTemplate,
} from '../services/selfInspection/register.service';

const uuid = z.string().uuid();
const templateSchema = z.object({
  name: z.string().trim().min(3).max(160),
  frequency: z.enum(FREQUENCIES),
  is_active: z.boolean().optional(),
  items: z.array(z.object({
    key: z.string().trim().max(60).nullable().optional(),
    label: z.string().trim().min(3).max(300),
    guidance: z.string().trim().max(500).nullable().optional(),
  }).strict()).min(1).max(60),
}).strict();

export async function getTemplates(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { templates: await listTemplates(req.query.all === '1') } }); } catch (e) { next(e); }
}

export async function postTemplate(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await saveTemplate(req.user!.id, templateSchema.parse(req.body ?? {})) }); } catch (e) { next(e); }
}

export async function putTemplate(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await saveTemplate(req.user!.id, { ...templateSchema.parse(req.body ?? {}), id: uuid.parse(req.params.id) }) }); } catch (e) { next(e); }
}

export async function postInspection(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      template_id: uuid,
      summary: z.string().trim().max(4000).nullable().optional(),
      results: z.array(z.object({
        item_key: z.string().trim().min(1).max(60),
        result: z.enum(RESULTS),
        note: z.string().trim().max(2000).nullable().optional(),
        action: z.object({
          description: z.string().trim().max(2000),
          owner_user_id: uuid,
          due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the due date as YYYY-MM-DD'),
        }).strict().nullable().optional(),
      }).strict()).min(1).max(60),
    }).strict().parse(req.body ?? {});
    res.status(201).json({ success: true, data: await recordInspection({ id: req.user!.id, role: req.user!.role }, d.template_id, d) });
  } catch (e) { next(e); }
}

export async function getInspections(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { inspections: await listInspections(uuid.optional().parse(req.query.template_id)) } }); } catch (e) { next(e); }
}

export async function getOneInspection(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getInspection(uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}

export async function getActions(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({ status: z.enum(['open', 'closed', 'overdue']).optional(), mine: z.enum(['1', 'true']).optional() }).parse(req.query);
    res.json({ success: true, data: { actions: await listActions({ status: f.status, ownerId: f.mine ? req.user!.id : undefined }) } });
  } catch (e) { next(e); }
}

export async function postActionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ status: z.enum(ACTION_STATUSES), note: z.string().trim().max(2000).nullable().optional() }).strict().parse(req.body ?? {});
    res.json({ success: true, data: await changeActionStatus({ id: req.user!.id, role: req.user!.role }, uuid.parse(req.params.id), d.status, d.note ?? null) });
  } catch (e) { next(e); }
}

export async function getActionOwners(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { people: await actionOwners() } }); } catch (e) { next(e); }
}
