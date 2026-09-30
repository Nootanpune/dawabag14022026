// src/controllers/credit.controller.ts — B2B credit accounts (Sprint 2)
// Limit 0 = no credit. Credit is only for KYC-approved retailers/wholesalers
// (utils/customerType.allowsCreditTerms). Every change is audit-logged.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { allowsCreditTerms, effectiveCustomerType } from '../utils/customerType';

// PATCH /admin/users/:userId/credit  { credit_limit_paise, notes? }
export async function setCreditLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = z.string().uuid().parse(req.params.userId);
    const { credit_limit_paise, notes } = z.object({
      credit_limit_paise: z.number().int().min(0).max(100_000_00_00),   // ≤ ₹1 crore
      notes: z.string().max(500).optional(),
    }).parse(req.body);

    const result = await withTransaction(async (client) => {
      const u = (await client.query(
        `SELECT customer_type, kyc_status, credit_limit_paise, credit_used_paise
         FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [userId])).rows[0];
      if (!u) throw new AppError('User not found', 404);
      if (credit_limit_paise > 0 && !allowsCreditTerms(effectiveCustomerType(u.customer_type, u.kyc_status))) {
        throw new AppError('Credit is only available to KYC-approved retailers and wholesalers', 400);
      }
      if (credit_limit_paise < u.credit_used_paise) {
        throw new AppError(`Limit cannot be below credit already used (₹${Math.round(u.credit_used_paise / 100)})`, 400);
      }
      await client.query(
        'UPDATE users SET credit_limit_paise = $2, updated_at = NOW() WHERE id = $1',
        [userId, credit_limit_paise]
      );
      await writeAuditTx(client, {
        userId, action: 'credit_limit_changed', performedBy: req.user!.id, ip: req.ip,
        oldValue: { credit_limit_paise: u.credit_limit_paise },
        newValue: { credit_limit_paise }, notes,
      });
      return { credit_limit_paise, credit_used_paise: u.credit_used_paise };
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// POST /orders/:id/settle-credit  { payment_reference, notes? }
// Records that a credit order has been paid; frees the buyer's credit.
export async function settleCreditOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const orderId = z.string().uuid().parse(req.params.id);
    const { payment_reference, notes } = z.object({
      payment_reference: z.string().trim().min(3).max(100),
      notes: z.string().max(500).optional(),
    }).parse(req.body);

    const result = await withTransaction(async (client) => {
      const o = (await client.query(
        `SELECT id, user_id, order_number, total_paise, payment_terms, credit_due_date, credit_settled_at
         FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
      if (!o) throw new AppError('Order not found', 404);
      if (!o.credit_due_date) throw new AppError('This is not a credit order', 400);
      if (o.credit_settled_at) throw new AppError('Credit for this order is already settled', 409);

      await client.query(
        `UPDATE orders SET credit_settled_at = NOW(), credit_settled_by = $2, updated_at = NOW() WHERE id = $1`,
        [orderId, req.user!.id]
      );
      await client.query(
        `UPDATE users SET credit_used_paise = GREATEST(credit_used_paise - $2, 0), updated_at = NOW() WHERE id = $1`,
        [o.user_id, o.total_paise]
      );
      await writeAuditTx(client, {
        userId: o.user_id, action: 'credit_settled', performedBy: req.user!.id, ip: req.ip,
        newValue: { order_id: orderId, order_number: o.order_number, amount_paise: o.total_paise, payment_reference },
        notes,
      });
      return { order_id: orderId, settled: true, amount_paise: o.total_paise };
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// GET /admin/credit/open — unsettled credit orders, oldest due first
export async function listOpenCredit(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await query(
      `SELECT o.id, o.order_number, o.total_paise, o.payment_terms, o.credit_due_date,
              (o.credit_due_date - CURRENT_DATE) AS days_to_due,
              u.id AS user_id, u.business_name, u.mobile, u.credit_limit_paise, u.credit_used_paise
       FROM orders o JOIN users u ON u.id = o.user_id
       WHERE o.credit_due_date IS NOT NULL AND o.credit_settled_at IS NULL
         AND o.status NOT IN ('cancelled', 'returned')
       ORDER BY o.credit_due_date ASC LIMIT 200`);
    res.json({ success: true, data: { orders: rows } });
  } catch (err) { next(err); }
}
