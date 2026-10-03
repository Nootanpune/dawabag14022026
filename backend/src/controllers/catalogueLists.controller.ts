// src/controllers/catalogueLists.controller.ts — Sprint 31: the managed lists of
// product categories and HSN codes (read by staff pickers; added to by admins and
// pharmacists, audited C-46).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createCategory, createHsnCode, listCategories, listHsnCodes } from '../services/catalogueLists/lists.service';
import { searchLists, updateCategory, updateHsnCode } from '../services/catalogueLists/manage.service';
import { mergeCategory, mergeHsnCode } from '../services/catalogueLists/merge.service';

/** Only admins switch a switched-off entry back on (pharmacists add new entries only, Sprint 32). */
const isAdmin = (req: Request) => ['admin', 'super_admin'].includes(req.user!.role);

// ?all=true includes switched-off entries (Admin → Catalogue lists); ?q= searches them all (Sprint 32)
const all = z.object({
  all: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  q: z.string().max(100).optional(),
});

export async function getCategoryList(req: Request, res: Response, next: NextFunction) {
  try {
    const f = all.parse(req.query);
    res.json({ success: true, data: f.q?.trim() ? await searchLists('categories', f.q) : await listCategories(f.all) });
  } catch (err) { next(err); }
}

export async function postCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = z.object({ name: z.string().max(200) }).strict().parse(req.body ?? {});
    const r = await createCategory(name, req.user!.id, isAdmin(req));
    res.status(r.created ? 201 : 200).json({ success: true, data: r });
  } catch (err) { next(err); }
}

export async function getHsnList(req: Request, res: Response, next: NextFunction) {
  try {
    const f = all.parse(req.query);
    res.json({ success: true, data: f.q?.trim() ? await searchLists('hsn', f.q) : await listHsnCodes(f.all) });
  } catch (err) { next(err); }
}

export async function postHsnCode(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({
      code: z.string().max(20),
      description: z.string().max(400),
      gst_rate: z.number().int().nullable().optional(),
    }).strict().parse(req.body ?? {});
    const r = await createHsnCode(body, req.user!.id, isAdmin(req));
    res.status(r.created ? 201 : 200).json({ success: true, data: r });
  } catch (err) { next(err); }
}

// ── Sprint 32: Admin → Catalogue lists (admins only; audited C-46) ──────────

export async function patchCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ name: z.string().max(200).optional(), is_active: z.boolean().optional() }).strict().parse(req.body ?? {});
    res.json({ success: true, data: await updateCategory(id, body, req.user!.id) });
  } catch (err) { next(err); }
}

export async function patchHsnCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = z.object({ code: z.string().max(20) }).parse(req.params);
    const body = z.object({
      code: z.string().max(20).optional(),
      description: z.string().max(400).optional(),
      gst_rate: z.number().int().nullable().optional(),
      is_active: z.boolean().optional(),
    }).strict().parse(req.body ?? {});
    res.json({ success: true, data: await updateHsnCode(code, body, req.user!.id) });
  } catch (err) { next(err); }
}

// ── Sprint 36: merge a duplicate entry into another (admins only; audited C-46) ──

export async function postMergeCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      into_id: z.string().uuid(),
      reason: z.string().trim().max(300).optional(),
    }).strict().parse(req.body ?? {});
    res.json({ success: true, data: await mergeCategory(id, body.into_id, req.user!.id, body.reason || null) });
  } catch (err) { next(err); }
}

export async function postMergeHsnCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = z.object({ code: z.string().max(20) }).parse(req.params);
    const body = z.object({
      into_code: z.string().max(20),
      // tax classification: say why (e.g. "typed 3004 instead of 30049099")
      reason: z.string().trim().min(5, 'Say why the codes are the same (at least 5 characters)').max(300),
    }).strict().parse(req.body ?? {});
    res.json({ success: true, data: await mergeHsnCode(code, body.into_code, req.user!.id, body.reason) });
  } catch (err) { next(err); }
}
