// src/controllers/order.controller.ts — v2.0
// Fixes: GAP-01 (customer-type pricing), GAP-02 (min order qty),
//        GAP-09 (credit/CAD payment terms), GAP-10 (prescription exemption for B2B)

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { generateOrderNumber } from '../utils/helpers';
import { queueNotification } from '../services/notification.service';
import { logger } from '../config/logger';

// Helper: pick correct price field based on customer type
function selectPriceField(customerType: string): string {
  switch (customerType) {
    case 'b2b_retailer':   return 'ptr_price_paise';
    case 'b2b_wholesaler': return 'pts_price_paise';
    case 'doc_hospital':   return 'institutional_price_paise';
    default:               return 'offer_price_paise';
  }
}

// Helper: does this customer need a prescription?
function requiresPrescription(customerType: string, drugSchedule: string): boolean {
  if (['b2b_retailer', 'b2b_wholesaler', 'doc_hospital'].includes(customerType)) {
    return false; // Drug license = authorisation
  }
  return ['Schedule H', 'Schedule H1'].includes(drugSchedule);
}

const createOrderSchema = z.object({
  patient_id:           z.string().uuid().optional(),
  address_id:           z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity:   z.number().int().min(1),
  })).min(1),
  coupon_code:          z.string().optional(),
  wallet_amount_paise:  z.number().int().min(0).optional().default(0),
  pincode:              z.string().length(6),
  payment_terms:        z.enum(['prepaid','cad','net_7','net_15','net_30','net_45','net_60','postpaid'])
                         .optional().default('prepaid'),
});

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const userId       = req.user!.id;
    const customerType = (req.user as any).customer_type || 'customer';
    const data         = createOrderSchema.parse(req.body);
    const isB2B        = ['b2b_retailer', 'b2b_wholesaler'].includes(customerType);
    const priceField   = selectPriceField(customerType);

    // Validate payment terms against customer type
    if (!isB2B && data.payment_terms !== 'prepaid') {
      throw new AppError('Credit and CAD terms are only available for B2B accounts', 400);
    }

    const order = await withTransaction(async (client) => {
      let subtotalPaise = 0;
      let gstPaise      = 0;
      let discountPaise = 0;
      let hasScheduleH  = false;
      const lineItems: any[] = [];

      for (const item of data.items) {
        const res = await client.query(
          `SELECT p.id, p.name, p.sku, p.drug_schedule, p.gst_rate,
                  p.mrp_paise, p.offer_price_paise,
                  COALESCE(p.ptr_price_paise, p.offer_price_paise) AS ptr_price_paise,
                  COALESCE(p.pts_price_paise, p.offer_price_paise) AS pts_price_paise,
                  COALESCE(p.institutional_price_paise, p.offer_price_paise) AS institutional_price_paise,
                  p.max_qty_per_order,
                  COALESCE(p.min_order_qty_retailer, 1) AS min_order_qty_retailer,
                  COALESCE(p.min_order_qty_wholesaler, 10) AS min_order_qty_wholesaler,
                  COALESCE(p.max_qty_per_order_retailer, 9999) AS max_qty_per_order_retailer,
                  COALESCE(p.max_qty_per_order_wholesaler, 9999) AS max_qty_per_order_wholesaler,
                  p.is_active, p.cold_chain,
                  COALESCE(p.reorder_level_qty, 10) AS reorder_level_qty,
                  COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) AS available_qty
           FROM products p
           LEFT JOIN inventory_batches b ON b.product_id = p.id
             AND b.quantity_available > b.quantity_reserved
             AND b.expiry_date > CURRENT_DATE + 30
           WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL
           GROUP BY p.id`,
          [item.product_id]
        );
        const prod = res.rows[0];
        if (!prod) throw new AppError(`Product not found: ${item.product_id}`, 404);

        // Hard block NDPS/Schedule X
        if (['NDPS', 'Schedule X'].includes(prod.drug_schedule)) {
          throw new AppError(`${prod.name} cannot be ordered online`, 403);
        }

        if (['Schedule H', 'Schedule H1'].includes(prod.drug_schedule)) {
          if (requiresPrescription(customerType, prod.drug_schedule)) {
            hasScheduleH = true;
          }
        }

        // Min/max quantity enforcement
        let minQty = 1;
        let maxQty = prod.max_qty_per_order;
        if (customerType === 'b2b_retailer') {
          minQty = prod.min_order_qty_retailer;
          maxQty = prod.max_qty_per_order_retailer;
        } else if (customerType === 'b2b_wholesaler') {
          minQty = prod.min_order_qty_wholesaler;
          maxQty = prod.max_qty_per_order_wholesaler;
        }

        if (item.quantity < minQty) {
          throw new AppError(`Minimum order for ${prod.name} is ${minQty} units`, 400);
        }
        if (item.quantity > maxQty) {
          throw new AppError(`Maximum order for ${prod.name} is ${maxQty} units`, 400);
        }

        // Stock check
        if (parseInt(prod.available_qty) < item.quantity) {
          throw new AppError(`Insufficient stock for ${prod.name}`, 400);
        }

        // Price selection based on customer type
        const unitPricePaise: number = prod[priceField] || prod.offer_price_paise;
        const assessable = unitPricePaise * item.quantity;
        const gstAmt     = Math.round(assessable * prod.gst_rate / 100);
        subtotalPaise   += assessable;
        gstPaise        += gstAmt;

        // Reserve inventory (FEFO)
        const batch = await client.query(
          `SELECT id, batch_number FROM inventory_batches
           WHERE product_id = $1
             AND quantity_available - quantity_reserved >= $2
             AND expiry_date > CURRENT_DATE + 30
           ORDER BY expiry_date ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [item.product_id, item.quantity]
        );
        if (!batch.rows[0]) throw new AppError(`Stock unavailable for ${prod.name}`, 400);

        await client.query(
          'UPDATE inventory_batches SET quantity_reserved = quantity_reserved + $1 WHERE id = $2',
          [item.quantity, batch.rows[0].id]
        );

        // Trigger reorder alert if stock below threshold
        const newQty = parseInt(prod.available_qty) - item.quantity;
        if (newQty <= prod.reorder_level_qty && prod.reorder_level_qty > 0) {
          client.query(
            `INSERT INTO low_stock_alerts (product_id, current_qty, reorder_level)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [item.product_id, newQty, prod.reorder_level_qty]
          ).catch((e: Error) => logger.warn(`Low stock alert: ${e.message}`));
        }

        lineItems.push({
          product_id: item.product_id, batch_id: batch.rows[0].id,
          batch_number: batch.rows[0].batch_number,
          product_name: prod.name, sku: prod.sku,
          quantity: item.quantity, unit_price_paise: unitPricePaise,
          mrp_paise: prod.mrp_paise, gst_rate: prod.gst_rate,
          gst_amount_paise: gstAmt, assessable_paise: assessable,
          line_total_paise: assessable + gstAmt,
        });
      }

      // Coupon
      let couponId: string | null = null;
      if (data.coupon_code) {
        const coupon = await client.query(
          `SELECT id, type, value, min_order_paise, max_discount_paise
           FROM coupons WHERE code = $1 AND is_active = TRUE
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (uses_limit IS NULL OR uses_count < uses_limit)`,
          [data.coupon_code]
        );
        if (!coupon.rows[0]) throw new AppError('Invalid or expired coupon', 400);
        const c = coupon.rows[0];
        if (subtotalPaise < c.min_order_paise) {
          throw new AppError(`Minimum order ₹${Math.round(c.min_order_paise/100)} required for coupon`, 400);
        }
        if (c.type === 'percentage') {
          discountPaise = Math.round(subtotalPaise * c.value / 100);
          if (c.max_discount_paise) discountPaise = Math.min(discountPaise, c.max_discount_paise);
        } else if (c.type === 'flat') {
          discountPaise = c.value;
        }
        couponId = c.id;
        await client.query('UPDATE coupons SET uses_count = uses_count + 1 WHERE id = $1', [c.id]);
      }

      // Shipping — free for B2B orders above Rs.5000
      const pincodeRes = await client.query(
        'SELECT shipping_charge_paise FROM pincode_serviceability WHERE pincode = $1',
        [data.pincode]
      );
      let shippingPaise = pincodeRes.rows[0]?.shipping_charge_paise ?? 4900;
      if (isB2B && subtotalPaise >= 500000) shippingPaise = 0;

      // Wallet
      let walletUsedPaise = 0;
      if (data.payment_terms === 'prepaid' && data.wallet_amount_paise > 0) {
        const profile = await client.query(
          'SELECT wallet_balance_paise FROM user_profiles WHERE user_id = $1 FOR UPDATE',
          [userId]
        );
        walletUsedPaise = Math.min(data.wallet_amount_paise, profile.rows[0]?.wallet_balance_paise ?? 0);
        if (walletUsedPaise > 0) {
          await client.query(
            'UPDATE user_profiles SET wallet_balance_paise = wallet_balance_paise - $1 WHERE user_id = $2',
            [walletUsedPaise, userId]
          );
        }
      }

      const totalPaise = Math.max(0, subtotalPaise + gstPaise + shippingPaise - discountPaise - walletUsedPaise);

      // Credit limit check
      if (['net_7','net_15','net_30','net_45','net_60','postpaid'].includes(data.payment_terms)) {
        const credit = await client.query(
          'SELECT credit_limit_paise, credit_used_paise FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const { credit_limit_paise, credit_used_paise } = credit.rows[0];
        if ((credit_used_paise + totalPaise) > credit_limit_paise) {
          throw new AppError(
            `Order exceeds credit limit. Available: ₹${Math.round((credit_limit_paise - credit_used_paise)/100)}`, 400
          );
        }
        await client.query(
          'UPDATE users SET credit_used_paise = credit_used_paise + $1 WHERE id = $2',
          [totalPaise, userId]
        );
      }

      // Credit due date
      const creditDaysMap: Record<string, number> = { net_7:7, net_15:15, net_30:30, net_45:45, net_60:60 };
      let creditDueDate = null;
      if (creditDaysMap[data.payment_terms]) {
        creditDueDate = new Date();
        creditDueDate.setDate(creditDueDate.getDate() + creditDaysMap[data.payment_terms]);
      }

      // Buyer GSTIN/PAN for invoice
      const buyer = await client.query('SELECT gstin, pan_number FROM users WHERE id = $1', [userId]);
      const buyerGstin = buyer.rows[0]?.gstin || null;

      // Generate invoice number
      const invRes = await client.query('SELECT generate_invoice_number() AS inv_no');
      const invoiceNumber = invRes.rows[0].inv_no;

      const orderStatus = data.payment_terms === 'prepaid' ? 'pending_payment' : 'confirmed';
      const orderNumber = generateOrderNumber();

      const newOrder = await client.query(
        `INSERT INTO orders (
           order_number, invoice_number, user_id, patient_id, address_id,
           status, payment_terms, credit_due_date,
           subtotal_paise, discount_paise, shipping_paise, gst_paise,
           total_paise, coupon_id, wallet_used_paise,
           buyer_gstin, buyer_pan, e_invoice_status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id, order_number, invoice_number`,
        [
          orderNumber, invoiceNumber,
          userId, data.patient_id||null, data.address_id,
          orderStatus, data.payment_terms, creditDueDate,
          subtotalPaise, discountPaise, shippingPaise, gstPaise,
          totalPaise, couponId, walletUsedPaise,
          buyerGstin, buyer.rows[0]?.pan_number||null,
          buyerGstin ? 'pending' : 'not_applicable',
        ]
      );
      const orderId = newOrder.rows[0].id;

      // Insert line items with CGST/SGST split
      for (const li of lineItems) {
        const halfGst = Math.round(li.gst_amount_paise / 2);
        await client.query(
          `INSERT INTO order_items (
             order_id, product_id, batch_id, product_name, sku,
             quantity, unit_price_paise, mrp_paise, gst_rate,
             cgst_paise, sgst_paise, igst_paise, gst_amount_paise, line_total_paise
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            orderId, li.product_id, li.batch_id, li.product_name, li.sku,
            li.quantity, li.unit_price_paise, li.mrp_paise, li.gst_rate,
            halfGst, li.gst_amount_paise - halfGst, 0,
            li.gst_amount_paise, li.line_total_paise,
          ]
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (user_id, action, new_value, ip_address)
         VALUES ($1,'order_created',$2,$3)`,
        [userId, JSON.stringify({
          order_id: orderId, order_number: orderNumber,
          customer_type: customerType, payment_terms: data.payment_terms,
          total_paise: totalPaise
        }), req.ip||null]
      );

      return {
        id: orderId, order_number: orderNumber, invoice_number: invoiceNumber,
        status: orderStatus, payment_terms: data.payment_terms,
        credit_due_date: creditDueDate, total_paise: totalPaise,
        has_schedule_h: hasScheduleH,
        requires_prescription: hasScheduleH && customerType === 'customer',
      };
    });

    await queueNotification({
      user_id: userId, type: 'ORDER_PLACED',
      title: 'Order placed successfully',
      body: `Order ${order.order_number} for ₹${Math.round(order.total_paise/100)} placed.`,
      data: { order_id: order.id, order_number: order.order_number },
    });

    logger.info(`Order ${order.order_number} by ${userId} (${customerType}) — ${order.payment_terms}`);
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
    const { status, tracking_id, courier_partner } = req.body;
    const validStatuses = ['confirmed','packed','dispatched','delivered','cancelled'];
    if (!validStatuses.includes(status)) throw new AppError(`Invalid status`, 400);

    const orderResult = await queryOne<any>(
      'SELECT id, status, user_id, buyer_gstin, e_invoice_status FROM orders WHERE id = $1', [id]
    );
    if (!orderResult) throw new AppError('Order not found', 404);

    await query(
      `UPDATE orders SET status=$1, tracking_id=COALESCE($2,tracking_id),
       courier_partner=COALESCE($3,courier_partner), updated_at=NOW() WHERE id=$4`,
      [status, tracking_id||null, courier_partner||null, id]
    );

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

    const msgs: Record<string,string> = {
      confirmed: 'Your order is confirmed and being prepared.',
      packed:    'Your order has been packed.',
      dispatched:`Your order is on the way! Tracking: ${tracking_id||'updating soon'}`,
      delivered: 'Your order has been delivered. Thank you!',
      cancelled: 'Your order has been cancelled. Refund within 5-7 days.',
    };
    await queueNotification({
      user_id: orderResult.user_id, type: `ORDER_${status.toUpperCase()}`,
      title: `Order ${status}`, body: msgs[status]||`Status: ${status}`,
      data: { order_id: id, status },
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

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const userId  = req.user!.id;
    const isAdmin = ['admin','super_admin','pharmacist_rx','pharmacist_pack'].includes(req.user!.role);
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
