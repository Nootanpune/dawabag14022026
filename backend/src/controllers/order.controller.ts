// src/controllers/order.controller.ts — HTTP layer for orders.
// Placement rules live in services/orderPlacement.service.ts.

import { Request, Response, NextFunction } from 'express';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { queueNotification } from '../services/notification.service';
import { logger } from '../config/logger';
import { cancelOrder } from '../services/cancellation.service';
import { handoverCode } from '../services/handover.service';
import { effectiveCustomerType, requiresPrescription } from '../utils/customerType';

const CANCELLABLE = ['pending_payment', 'payment_failed', 'confirmed', 'rx_pending', 'rx_verified', 'rx_rejected', 'packing'];
import { createOrderSchema, placeOrder } from '../services/orderPlacement.service';

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createOrderSchema.parse(req.body);
    const order = await placeOrder(req.user!, data, { ip: req.ip });
    logger.info(`Order ${order.order_number} by ${req.user!.id} (${req.user!.pricing_type}) — ${order.payment_terms}`);
    res.status(201).json({
      success: true,
      data: {
        order,
        next_step: order.requires_prescription ? 'upload_prescription'
          : order.payment_terms === 'prepaid' ? 'pay_now' : 'order_confirmed',
      },
    });
  } catch (err) { next(err); }
}

// PATCH /orders/:id/status — admin cancellation only. Every other status change
// happens through its own guarded step (payment capture, pharmacist review,
// pack/dispatch/deliver), so no one can skip payment or the prescription gate.
export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body;
    if (status !== 'cancelled') {
      throw new AppError('Only cancellation is allowed here; use the fulfilment steps to move an order forward', 400);
    }
    const reason = typeof req.body.reason === 'string' && req.body.reason.trim().length >= 3 ? req.body.reason.trim() : 'Cancelled by Dawabag';
    res.json({ success: true, data: await cancelOrder(req.params.id, { id: req.user!.id, staff: true }, reason) });
  } catch (err) { next(err); }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId  = req.user!.id;
    const isAdmin = ['admin','super_admin','pharmacist_rx','pharmacist_pack'].includes(req.user!.role);
    // Delivery staff see only orders that are out for delivery
    if (req.user!.role === 'delivery') {
      const out = await queryOne(`SELECT 1 FROM order_shipments WHERE order_id = $1 AND status = 'dispatched'`, [id]);
      if (!out) throw new AppError('Order not found', 404);
    }
    const canSeeAll = isAdmin || req.user!.role === 'delivery';

    const orderResult = await queryOne<any>(
      `SELECT o.*, a.address_line1, a.city, a.state, a.pincode,
              a.full_name AS delivery_name, a.mobile AS delivery_mobile,
              up.full_name AS customer_name, u.mobile AS customer_mobile, u.customer_type, u.kyc_status AS buyer_kyc_status
       FROM orders o
       JOIN addresses a ON o.address_id = a.id
       JOIN users u ON o.user_id = u.id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE o.id = $1 ${canSeeAll ? '' : 'AND o.user_id = $2'}`,
      canSeeAll ? [id] : [id, userId]
    );
    if (!orderResult) throw new AppError('Order not found', 404);

    const items = await query(
      `SELECT oi.*, p.s3_image_key, p.drug_schedule,
              COALESCE(ib.batch_number, pi.batch_number) AS batch_number, COALESCE(ib.expiry_date, pi.expiry_date) AS batch_expiry,
              COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN return_requests rr ON rr.id = ri.return_id
                        WHERE ri.order_item_id = oi.id AND rr.status IN ('requested', 'approved', 'closed')), 0)::int AS returned_qty
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
       LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
       LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
       WHERE oi.order_id = $1`,
      [id]
    );

    const einvoice = await queryOne<any>(
      'SELECT irn, ack_no, irn_status, invoice_pdf_s3_key FROM e_invoices WHERE order_id = $1',
      [id]
    );

    // Seller of record per shipment (C-05); partners shown by name
    const shipments = await query<any>(
      `SELECT s.id, s.seller_type, COALESCE(v.name, 'Dawabag') AS seller_name, s.invoice_number, s.status,
              s.total_paise, s.courier_partner, s.awb_number, s.dispatched_at, s.delivered_at,
              s.seal_number, s.handover_code_required, s.received_by_name, s.received_by_relation
       FROM order_shipments s LEFT JOIN vendors v ON v.id = s.partner_id
       WHERE s.order_id = $1 ORDER BY s.seller_type, v.name`, [id]);

    // Only the buyer sees the delivery code, and only while the pack is on its way (C-26)
    for (const s of shipments) {
      s.handover_code = s.handover_code_required && s.status === 'dispatched' && orderResult.user_id === userId
        ? handoverCode(s.id, s.dispatched_at) : null;
    }

    const [creditNotes, refunds, returns] = await Promise.all([
      query(`SELECT id, credit_note_number, shipment_id, reason, total_paise, created_at FROM credit_notes WHERE order_id = $1 ORDER BY created_at`, [id]),
      query(`SELECT id, source, method, amount_paise, status, processed_at, created_at FROM refunds WHERE order_id = $1 ORDER BY created_at`, [id]),
      query(`SELECT id, return_no, shipment_id, reason, status, refund_paise, created_at FROM return_requests WHERE order_id = $1 ORDER BY created_at`, [id]),
    ]);
    const buyerType = effectiveCustomerType(orderResult.customer_type, orderResult.buyer_kyc_status);
    const needsRx = items.some((i: any) => requiresPrescription(buyerType, i.drug_schedule));
    // Buyers may cancel until packing starts (C-37)
    const canCancel = CANCELLABLE.includes(orderResult.status) && shipments.every((s: any) => ['pending', 'cancelled'].includes(s.status));

    res.json({ success: true, data: {
      ...orderResult, items, shipments, e_invoice: einvoice||null,
      requires_prescription: needsRx, can_cancel: canCancel,
      credit_notes: creditNotes, refunds, returns,
    } });
  } catch (err) { next(err); }
}

// GET /orders/my — the caller's own orders, whatever their role
export function getMyOrders(req: Request, res: Response, next: NextFunction) {
  return listOrders(req, res, next, false);
}

// GET /orders/queue — all orders, for staff (route restricts roles)
export function getOrderQueue(req: Request, res: Response, next: NextFunction) {
  return listOrders(req, res, next, true);
}

async function listOrders(req: Request, res: Response, next: NextFunction, isAdmin: boolean) {
  try {
    const userId  = req.user!.id;
    const status  = req.query.status as string;
    const page    = Math.max(1, parseInt(req.query.page as string||'1'));
    const limit   = Math.min(50, parseInt(req.query.limit as string||'20'));
    const offset  = (page-1)*limit;

    const conditions = isAdmin ? [] : ['o.user_id = $1'];
    const params: any[] = isAdmin ? [] : [userId];
    let pi = params.length+1;

    if (status) { conditions.push(`o.status = $${pi}`); params.push(status); pi++; }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const orders = await query(
      `SELECT o.id, o.order_number, o.invoice_number, o.status, o.payment_terms,
              o.total_paise, o.credit_due_date, o.created_at,
              up.full_name AS customer_name,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o
       LEFT JOIN user_profiles up ON up.user_id = o.user_id
       ${where} ORDER BY o.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: { orders, page, limit } });
  } catch (err) { next(err); }
}
