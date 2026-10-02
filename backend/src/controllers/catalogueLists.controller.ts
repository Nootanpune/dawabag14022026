// src/controllers/catalogueLists.controller.ts — Sprint 31: the managed lists of
// product categories and HSN codes (read by staff pickers; added to by admins and
// pharmacists, audited C-46).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createCategory, createHsnCode, listCategories, listHsnCodes } from '../services/catalogueLists/lists.service';

const all = z.object({ all: z.enum(['true', 'false']).optional().transform((v) => v === 'true') });

export async function getCategoryList(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listCategories(all.parse(req.query).all) }); } catch (err) { next(err); }
}

export async function postCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = z.object({ name: z.string().max(200) }).strict().parse(req.body ?? {});
    const r = await createCategory(name, req.user!.id);
    res.status(r.created ? 201 : 200).json({ success: true, data: r });
  } catch (err) { next(err); }
}

export async function getHsnList(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listHsnCodes(all.parse(req.query).all) }); } catch (err) { next(err); }
}

export async function postHsnCode(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({
      code: z.string().max(20),
      description: z.string().max(400),
      gst_rate: z.number().int().nullable().optional(),
    }).strict().parse(req.body ?? {});
    const r = await createHsnCode(body, req.user!.id);
    res.status(r.created ? 201 : 200).json({ success: true, data: r });
  } catch (err) { next(err); }
}
