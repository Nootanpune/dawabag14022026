import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { infoEditor, infoReturnedTo, infoReviewQueue, publicInfo, reviewInfo, saveInfoDraft, submitInfo } from '../services/medicineInfo/versions.service';

// Medicine information on the product page (Sprint 33). Buyers see only the
// approved version (C-19); staff write drafts; a pharmacist reviews (C-17, C-19);
// every step audited (C-46). Request parsing only — the rules are in the services.
const productId = (req: Request) => z.string().uuid().parse(req.params.productId);

// GET /medicines/:productId/info — public
export async function getMedicineInfo(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await publicInfo(productId(req)) }); } catch (e) { next(e); }
}

// GET /medicines/:productId/info/editor — pharmacist / admin
export async function getMedicineInfoEditor(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await infoEditor(productId(req)) }); } catch (e) { next(e); }
}

// PUT /medicines/:productId/info/draft { content }
export async function putMedicineInfoDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = z.object({ content: z.unknown() }).strict().parse(req.body);
    res.json({ success: true, data: await saveInfoDraft(req.user!.id, productId(req), content) });
  } catch (e) { next(e); }
}

// POST /medicines/:productId/info/submit
export async function postMedicineInfoSubmit(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await submitInfo(req.user!.id, productId(req)) }); } catch (e) { next(e); }
}

// POST /medicines/:productId/info/review { approve, notes } — pharmacist only (C-19)
export async function postMedicineInfoReview(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ approve: z.boolean(), notes: z.string().trim().min(3, 'Write a short note (at least 3 characters)').max(1000) }).parse(req.body);
    res.json({ success: true, data: await reviewInfo(req.user!.id, productId(req), d.approve, d.notes) });
  } catch (e) { next(e); }
}

// GET /medicines/info-review/queue — each version says whether the viewer wrote it (Sprint 36: four eyes)
export async function getMedicineInfoQueue(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { versions: await infoReviewQueue(req.user!.id) } }); } catch (e) { next(e); }
}

// GET /medicines/info-review/returned — Sprint 36: rejected versions sent back to the viewer
export async function getMedicineInfoReturned(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { versions: await infoReturnedTo(req.user!.id) } }); } catch (e) { next(e); }
}
