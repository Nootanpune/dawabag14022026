// Who supplied a partner's batch (Sprint 39, C-02, C-28): Dawabag's admin looks it up
// for any partner; the partner sees its own (partner.controller getMyBatchProvenance).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { listProvenance, provenanceRequired } from '../services/partnerProvenance/provenance.service';

export async function getProvenance(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({
      partner_id: z.string().uuid().optional(), product_id: z.string().uuid().optional(),
      batch: z.string().max(100).optional(), q: z.string().max(100).optional(), missing: z.enum(['1', 'true']).optional(),
    }).parse(req.query);
    res.json({ success: true, data: {
      required_for_h1_and_cold_chain: await provenanceRequired(),
      batches: await listProvenance({ partnerId: f.partner_id, productId: f.product_id, batch: f.batch, q: f.q, missingOnly: !!f.missing }),
    } });
  } catch (e) { next(e); }
}
