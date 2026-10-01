// src/controllers/policy.controller.ts — public policies and admin publishing (C-39)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { LANGUAGES, POLICY_KEYS, currentPolicies, getPolicy, policyHistory, publishPolicy, publishTranslation } from '../services/policy.service';

const key = z.enum(POLICY_KEYS);

export async function getPolicies(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { policies: await currentPolicies() } }); } catch (err) { next(err); }
}

export async function getOnePolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.object({ version: z.coerce.number().int().min(1).optional(), lang: z.enum(LANGUAGES).default('en') }).parse(req.query);
    res.json({ success: true, data: await getPolicy(key.parse(req.params.key), q.version, q.lang) });
  } catch (err) { next(err); }
}

export async function getPolicyHistory(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { versions: await policyHistory(key.parse(req.params.key)) } }); } catch (err) { next(err); }
}

export async function postPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      doc_key: key,
      title: z.string().trim().min(3).max(200),
      body: z.string().trim().min(50).max(100_000),
      effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      lawyer_reviewed: z.boolean(),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await publishPolicy(req.user!.id, d) });
  } catch (err) { next(err); }
}

// POST /legal/policies/:key/translations — Marathi / Hindi text of an English version (C-40)
export async function postTranslation(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      version: z.number().int().min(1), language: z.enum(['mr', 'hi']),
      title: z.string().trim().min(3).max(200), body: z.string().trim().min(50).max(100_000), lawyer_reviewed: z.boolean(),
    }).parse(req.body);
    res.status(201).json({ success: true, data: await publishTranslation(req.user!.id, { doc_key: key.parse(req.params.key), ...d }) });
  } catch (err) { next(err); }
}
