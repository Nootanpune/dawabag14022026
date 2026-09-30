// src/controllers/policy.controller.ts — public policies and admin publishing (C-39)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { POLICY_KEYS, currentPolicies, getPolicy, policyHistory, publishPolicy } from '../services/policy.service';

const key = z.enum(POLICY_KEYS);

export async function getPolicies(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { policies: await currentPolicies() } }); } catch (err) { next(err); }
}

export async function getOnePolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const version = z.coerce.number().int().min(1).optional().parse(req.query.version);
    res.json({ success: true, data: await getPolicy(key.parse(req.params.key), version) });
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
