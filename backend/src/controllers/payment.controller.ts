import { Request, Response, NextFunction } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { queueNotification } from '../services/notification.service';
import { logger } from '../config/logger';
import { writeAudit, writeAuditTx } from '../utils/audit';

let razorpay: Razorpay;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return razorpay;
}

// ─── Create Razorpay Order ────────────────────────────────────────────────────
export async function createPaymentOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id } = req.body;
    const userId = req.user!.id;

    const order = await queryOne<{
      id: string; order_number: string; total_paise: number;
      status: string; user_id: string;
    }>(
      'SELECT id, order_number, total_paise, status, user_id FROM orders WHERE id = $1 AND deleted_at IS NULL',
      [order_id]
    );

    if (!order) throw new AppError('Order not found', 404);
    if (order.user_id !== userId) throw new AppError('Access denied', 403);
    if (order.status !== 'pending_payment') {
      throw new AppError('Order is not pending payment', 400);
    }
    if (order.total_paise <= 0) {
      throw new AppError('Invalid order amount', 400);
    }

    const rzpOrder = await getRazorpay().orders.create({
      amount: order.total_paise,
      currency: 'INR',
      receipt: order.order_number,
      notes: { order_id: order.id, user_id: userId },
    });

    // Store payment record
    await query(
      `INSERT INTO payments (order_id, gateway, gateway_order_id, status, amount_paise)
       VALUES ($1, 'razorpay', $2, 'created', $3)
       ON CONFLICT (gateway_order_id) DO NOTHING`,
      [order.id, rzpOrder.id, order.total_paise]
    );

    res.json({
      success: true,
      data: {
        razorpay_order_id: rzpOrder.id,
        razorpay_key_id: process.env.RAZORPAY_KEY_ID,
        amount: order.total_paise,
        currency: 'INR',
        order_number: order.order_number,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Verify Payment & Confirm Order ──────────────────────────────────────────
export async function verifyPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
    } = req.body;

    // Verify signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      throw new AppError('Payment verification failed — invalid signature', 400);
    }

    // Fetch payment details from Razorpay
    const payment = await getRazorpay().payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      throw new AppError(`Payment not captured. Status: ${payment.status}`, 400);
    }

    await withTransaction(async (client) => {
      // Update payment record
      await client.query(
        `UPDATE payments
         SET gateway_payment_id = $1, gateway_signature = $2,
             status = 'captured', method = $3, paid_at = NOW()
         WHERE gateway_order_id = $4`,
        [razorpay_payment_id, razorpay_signature, payment.method, razorpay_order_id]
      );

      // Update order status to rx_pending (if has Rx-required items) or packing
      const orderItems = await client.query(
        `SELECT p.drug_schedule FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [order_id]
      );

      const needsRx = orderItems.rows.some((r: any) =>
        ['Schedule H', 'Schedule H1'].includes(r.drug_schedule)
      );

      const newStatus = needsRx ? 'rx_pending' : 'packing';

      await client.query(
        `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, order_id]
      );

      await writeAuditTx(client, {
        userId: req.user!.id, action: 'payment_captured', performedBy: req.user!.id, ip: req.ip,
        newValue: { order_id, gateway_order_id: razorpay_order_id, gateway_payment_id: razorpay_payment_id, order_status: newStatus },
      });
    });

    // Get order details for notification
    const orderData = await queryOne<{ user_id: string; order_number: string; status: string }>(
      'SELECT user_id, order_number, status FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderData) {
      await queueNotification({
        userId: orderData.user_id,
        type: 'payment_confirmed',
        orderId: order_id,
        orderNumber: orderData.order_number,
        status: orderData.status,
      });
    }

    res.json({
      success: true,
      message: 'Payment verified and order confirmed',
      data: {
        order_id,
        payment_id: razorpay_payment_id,
        status: orderData?.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Razorpay Webhook ─────────────────────────────────────────────────────────
export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-razorpay-signature'] as string;
      const body = JSON.stringify(req.body);
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');
      if (signature !== expectedSig) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const { event, payload } = req.body;
    logger.info(`Razorpay webhook: ${event}`);

    if (event === 'payment.failed') {
      const paymentEntity = payload.payment?.entity;
      if (paymentEntity?.order_id) {
        await query(
          `UPDATE payments SET status = 'failed'
           WHERE gateway_order_id = $1`,
          [paymentEntity.order_id]
        );
        const order = await queryOne<{ id: string; user_id: string; order_number: string }>(
          `SELECT o.id, o.user_id, o.order_number FROM orders o
           JOIN payments p ON p.order_id = o.id
           WHERE p.gateway_order_id = $1`,
          [paymentEntity.order_id]
        );
        if (order) {
          await query(
            `UPDATE orders SET status = 'payment_failed' WHERE id = $1`,
            [order.id]
          );
        }
      }
    }

    if (event === 'refund.created') {
      const refundEntity = payload.refund?.entity;
      if (refundEntity?.payment_id) {
        await query(
          `UPDATE payments SET status = 'refunded',
           refund_amount_paise = $1, refund_id = $2, refunded_at = NOW()
           WHERE gateway_payment_id = $3`,
          [refundEntity.amount, refundEntity.id, refundEntity.payment_id]
        );
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
}

// ─── Initiate Refund ──────────────────────────────────────────────────────────
export async function initiateRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id, reason } = req.body;

    const payment = await queryOne<{
      gateway_payment_id: string; amount_paise: number; status: string; user_id: string;
    }>(
      `SELECT p.gateway_payment_id, p.amount_paise, p.status, o.user_id
       FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE o.id = $1 AND p.status = 'captured'`,
      [order_id]
    );

    if (!payment) throw new AppError('No captured payment found for this order', 404);

    const refund = await getRazorpay().payments.refund(payment.gateway_payment_id, {
      amount: payment.amount_paise,
      speed: 'normal',
      notes: { reason: reason || 'Customer request' },
    });

    await query(
      `UPDATE payments SET status = 'refunded',
       refund_amount_paise = $1, refund_id = $2, refunded_at = NOW()
       WHERE gateway_payment_id = $3`,
      [refund.amount, refund.id, payment.gateway_payment_id]
    );

    await writeAudit({
      userId: payment.user_id, action: 'refund_initiated', performedBy: req.user!.id, ip: req.ip,
      newValue: { order_id, refund_id: refund.id, amount_paise: refund.amount }, notes: reason,
    });

    res.json({ success: true, message: 'Refund initiated', data: { refund_id: refund.id } });
  } catch (error) {
    next(error);
  }
}
