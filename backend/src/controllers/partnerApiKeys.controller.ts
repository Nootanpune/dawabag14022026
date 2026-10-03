// src/controllers/partnerApiKeys.controller.ts — Sprint 36: API keys for a partner's
// stock feed. Issued, listed and revoked by an admin (any partner) or the partner's
// owner login (its own keys only). The secret appears only in the issue response.
// Request parsing only — the rules are in services/partnerApiKeys (C-44, C-46).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { issueKey, listKeys, revokeKey, Issuer } from '../services/partnerApiKeys/keys.service';

const uuid = z.string().uuid();
const issueBody = z.object({ label: z.string().max(200) }).strict();
const revokeBody = z.object({ reason: z.string().trim().max(300).optional() }).strict();

// Admin: /admin/partners/:vendorId/api-keys
const adminOf = (req: Request): Issuer => ({ userId: req.user!.id, as: 'admin' });
export async function adminGetKeys(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { keys: await listKeys(uuid.parse(req.params.vendorId)) } }); } catch (e) { next(e); }
}
export async function adminPostKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { label } = issueBody.parse(req.body ?? {});
    res.status(201).json({ success: true, data: await issueKey(uuid.parse(req.params.vendorId), label, adminOf(req)) });
  } catch (e) { next(e); }
}
export async function adminRevokeKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = revokeBody.parse(req.body ?? {});
    res.json({ success: true, data: await revokeKey(uuid.parse(req.params.vendorId), uuid.parse(req.params.keyId), adminOf(req), reason || null) });
  } catch (e) { next(e); }
}

// Partner owner: /partner/api-keys (its own partner only)
const ownerOf = (req: Request): Issuer => ({ userId: req.user!.id, as: 'partner_owner' });
export async function partnerGetKeys(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { keys: await listKeys(req.partner!.vendorId) } }); } catch (e) { next(e); }
}
export async function partnerPostKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { label } = issueBody.parse(req.body ?? {});
    res.status(201).json({ success: true, data: await issueKey(req.partner!.vendorId, label, ownerOf(req)) });
  } catch (e) { next(e); }
}
export async function partnerRevokeKey(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = revokeBody.parse(req.body ?? {});
    res.json({ success: true, data: await revokeKey(req.partner!.vendorId, uuid.parse(req.params.keyId), ownerOf(req), reason || null) });
  } catch (e) { next(e); }
}
