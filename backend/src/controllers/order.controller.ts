// src/controllers/order.controller.ts — HTTP layer for orders.
// Placement rules live in services/orderPlacement.service.ts.

import { Request, Response, NextFunction } from 'express';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { queueNotification } from '../services/notification.service';
import { logger } from '../config/logger';
import { releaseOrderReservations } from '../services/shipment.service';
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

export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status, awb_number, courier_partner } = req.body;
    const validStatuses = ['confirmed','packed','dispatched','delivered','cancelled'];
    if (!validStatuses.includes(status)) throw new AppError(`Invalid status`, 400);

    const orderResult = await queryOne<any>(
      'SELECT id, order_number, status, user_id, buyer_gstin, e_invoice_status FROM orders WHERE id = $1', [id]
    );
    if (!orderResult) throw new AppError('Order not found', 404);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE orders SET status=$1, awb_number=COALESCE($2,awb_number),
         courier_partner=COALESCE($3,courier_partner), updated_at=NOW() WHERE id=$4`,
        [status, awb_number||null, courier_partner||null, id]
      );
      // Cancelling frees reserved stock (Dawabag and partner batches) exactly once
      if (status === 'cancelled' && orderResult.status !== 'cancelled') {
        await releaseOrderReservations(client, id);
      }
    });

    // Trigger e-invoice when packed (for B2B orders with GSTIN)
    if (status === 'packed' && orderResult.buyer_gstin && orderResult.e_invoice_status === 'pending') {
      logger.info(`IRN generation triggered for order ${id} (status: packed)`);
      // In production: await EInvoiceService.generateIRN(id)
      // or: eInvoiceQueue.add('generate', { orderId: id })
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, new_value, performed_by)
       VALUES ($1,'order_status_updated',$2,$3)`,
      [orderResult.user_id, JSON.stringify({order_id:id, new_status:status}), req.user!.id]
    );

    // Templates exist for packed/dispatched/delivered; other statuses use the generic one
    await queueNotification({
      userId: orderResult.user_id,
      type: ['packed', 'dispatched', 'delivered'].includes(status) ? status : 'order_status',
      status, orderId: id, orderNumber: orderResult.order_number,
      awbNumber: awb_number, courierPartner: courier_partner,
    });

    res.json({ success: true, data: { id, status } });
  } catch (err) { next(err); }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId  = req.user!.id;
    const isAdmin = ['admin','super_admin','pharmacist_rx','pharmacist_pack','delivery'].includes(req.user!.role);

    const orderResult = await queryOne<any>(
      `SELECT o.*, a.address_line1, a.city, a.state, a.pincode,
              a.full_name AS delivery_name, a.mobile AS delivery_mobile,
              up.full_name AS customer_name, u.mobile AS customer_mobile, u.customer_type
       FROM orders o
       JOIN addresses a ON o.address_id = a.id
       JOIN users u ON o.user_id = u.id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE o.id = $1 ${isAdmin ? '' : 'AND o.user_id = $2'}`,
      isAdmin ? [id] : [id, userId]
    );
    if (!orderResult) throw new AppError('Order not found', 404);

    const items = await query(
      `SELECT oi.*, p.s3_image_key, p.drug_schedule FROM order_items oi
       JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
      [id]
    );

    const einvoice = await queryOne<any>(
      'SELECT irn, ack_no, irn_status, invoice_pdf_s3_key FROM e_invoices WHERE order_id = $1',
      [id]
    );

    res.json({ success: true, data: { ...orderResult, items, e_invoice: einvoice||null } });
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
