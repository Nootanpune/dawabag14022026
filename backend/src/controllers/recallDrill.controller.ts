// Mock recall drills (Sprint 40; O15; C-28) — admins only. Rules in services/recallDrills/.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { closeDrill, drillableBatches, getDrill, listDrills, startDrill } from '../services/recallDrills/drill.service';
import { renderDrillPdf } from '../services/recallDrills/report';
import { writeAudit } from '../utils/audit';

const uuid = z.string().uuid();

export async function postDrill(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      product_id: uuid,
      batch_number: z.string().trim().min(1).max(100),
      scenario: z.string().trim().min(5).max(2000),
    }).strict().parse(req.body ?? {});
    res.status(201).json({ success: true, data: await startDrill(req.user!.id, d) });
  } catch (e) { next(e); }
}

export async function getDrills(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { drills: await listDrills() } }); } catch (e) { next(e); }
}

export async function getDrillBatches(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { batches: await drillableBatches(z.string().max(100).optional().parse(req.query.q)) } }); } catch (e) { next(e); }
}

export async function getOneDrill(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getDrill(uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}

export async function postCloseDrill(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ conclusion: z.string().trim().min(10).max(4000), actions: z.string().trim().max(4000).nullable().optional() }).strict().parse(req.body ?? {});
    res.json({ success: true, data: await closeDrill(req.user!.id, uuid.parse(req.params.id), d.conclusion, d.actions ?? null) });
  } catch (e) { next(e); }
}

// The report is built from the record each time it is asked for; nothing is stored
export async function getDrillReport(req: Request, res: Response, next: NextFunction) {
  try {
    const d = await getDrill(uuid.parse(req.params.id));
    const pdf = await renderDrillPdf(d);
    await writeAudit({ userId: null, action: 'recall_drill_report_downloaded', performedBy: req.user!.id, newValue: { drill_id: d.id } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${d.drill_no}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (e) { next(e); }
}
