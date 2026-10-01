// src/controllers/stock.controller.ts — admin low-stock dashboard (Sprint 2)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database';

// GET /inventory/low-stock?status=REORDER%20NOW
// From v_low_stock (03 migration). Default: everything that is not OK.
export async function getLowStock(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = z.object({
      status: z.enum(['OUT OF STOCK', 'REORDER NOW', 'LOW STOCK']).optional(),
    }).parse(req.query);

    const products = await query(
      `SELECT v.id, v.name, v.sku, v.category, v.reorder_level_qty,
              v.current_stock::int AS current_stock, v.preferred_vendor_id,
              v.preferred_vendor_name, v.stock_status,
              (SELECT MAX(a.alert_sent_at) FROM low_stock_alerts a
                WHERE a.product_id = v.id AND a.resolved_at IS NULL) AS last_alert_at
       FROM v_low_stock v
       WHERE v.stock_status <> 'OK' ${status ? 'AND v.stock_status = $1' : ''}
       ORDER BY CASE v.stock_status WHEN 'OUT OF STOCK' THEN 0 WHEN 'REORDER NOW' THEN 1 ELSE 2 END,
                v.current_stock ASC
       LIMIT 500`,
      status ? [status] : []
    );
    const counts = await query<{ stock_status: string; count: string }>(
      `SELECT stock_status, COUNT(*) FROM v_low_stock WHERE stock_status <> 'OK' GROUP BY stock_status`
    );
    res.json({
      success: true,
      data: {
        products,
        counts: Object.fromEntries(counts.map((c) => [c.stock_status, Number(c.count)])),
      },
    });
  } catch (err) { next(err); }
}
