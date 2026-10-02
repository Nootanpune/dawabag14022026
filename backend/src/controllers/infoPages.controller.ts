import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { getInfoPage, infoPageHistory, listInfoPages, publishInfoPage } from '../services/infoPages/infoPages.service';
import { isInfoPageKey, unknownTokens } from '../services/infoPages/tokens';

// Trust pages (Sprint 33): public read; admins publish a new version (audited, C-46).
function key(req: Request) {
  const k = req.params.key;
  if (!isInfoPageKey(k)) throw new AppError('Page not found', 404);
  return k;
}

export async function getInfoPages(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listInfoPages() }); } catch (e) { next(e); }
}

export async function getInfoPageByKey(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getInfoPage(key(req)) }); } catch (e) { next(e); }
}

export async function getInfoPageHistory(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await infoPageHistory(key(req)) }); } catch (e) { next(e); }
}

export async function postInfoPage(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      title: z.string().trim().min(3).max(120),
      summary: z.string().trim().min(10).max(300),
      body: z.string().trim().min(20).max(20000),
    }).strict().parse(req.body);
    const unknown = unknownTokens(`${d.summary}\n${d.body}`);
    if (unknown.length) throw new AppError(`Unknown placeholder: ${unknown.map((t) => `{{${t}}}`).join(', ')}`, 400);
    res.status(201).json({ success: true, data: await publishInfoPage(req.user!.id, key(req), d) });
  } catch (e) { next(e); }
}
