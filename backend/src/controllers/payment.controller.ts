import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getRazorpay, validWebhookSignature } from '../services/razorpay.client';
import { handleRecurringCapture } from '../services/mandate.service';
import { moveOrderToFulfilment } from '../services/paymentCapture.service';
import { recordRefund, sendGatewayRefunds, settleGatewayLeg } from '../services/refund.service';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { queueNotification } from '../services/notification.service';
import { logger } from '../config/logger';
import { writeAudit, writeAuditTx } from '../utils/audit';

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
    } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new AppError('razorpay_order_id, razorpay_payment_id and razorpay_signature are required', 400);
    }

    // The order is the one this Razorpay order was created for, and it must be
    // the caller's — never an order_id taken from the request body.
    const owned = await queryOne<{ order_id: string; amount_paise: number; status: string }>(
      `SELECT p.order_id, p.amount_paise, p.status FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.gateway_order_id = $1 AND o.user_id = $2`,
      [razorpay_order_id, req.user!.id]
    );
    if (!owned) throw new AppError('Payment not found for this account', 404);
    if (owned.status === 'captured') throw new AppError('This payment is already recorded', 409);
    const order_id = owned.order_id;

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
    if (payment.order_id !== razorpay_order_id || Number(payment.amount) !== owned.amount_paise) {
      throw new AppError('Payment does not match this order', 400);
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

      // rx_pending for prescription lines (buyer's exemption applied), else packing
      const newStatus = await moveOrderToFulfilment(client, order_id);

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
    // Never act on an unsigned or mis-signed webhook (it could mark orders paid)
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!validWebhookSignature(rawBody, req.headers['x-razorpay-signature'] as string | undefined)) {
      logger.warn('Rejected Razorpay webhook: missing secret or invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body;
    logger.info(`Razorpay webhook: ${event}`);

    // Mandate registration and recurring (refill) charges
    if (event === 'payment.captured' || event === 'token.confirmed') {
      await handleRecurringCapture(event, payload);
    }

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

    // Refund legs we created are matched by refund id (refund.service); the
    // payment total is rolled up from the ledger, never overwritten (C-37)
    if (event === 'refund.processed' || event === 'refund.created') {
      const refundEntity = payload.refund?.entity;
      if (refundEntity?.id && (event === 'refund.processed' || refundEntity.status === 'processed')) {
        const leg = await queryOne<{ id: string }>(`SELECT id FROM refunds WHERE gateway_refund_id = $1`, [refundEntity.id]);
        if (leg) await withTransaction((client) => settleGatewayLeg(client, leg.id));
        else logger.warn(`Refund ${refundEntity.id} is not in the refund ledger (made outside Dawabag?)`);
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
}

// ─── Initiate Refund (admin goodwill/other) ───────────────────────────────────
// Goes through the refund ledger like cancellations and returns.
export async function initiateRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id, reason, amount_paise } = req.body;
    if (typeof order_id !== 'string') throw new AppError('order_id is required', 422);
    const refund = await withTransaction(async (client) => {
      const o = (await client.query(
        `SELECT o.total_paise + o.wallet_used_paise - COALESCE((SELECT SUM(amount_paise) FROM refunds r
           WHERE r.order_id = o.id AND r.status <> 'failed'), 0) AS left
         FROM orders o WHERE o.id = $1`, [order_id])).rows[0];
      if (!o) throw new AppError('Order not found', 404);
      const amount = amount_paise === undefined ? Number(o.left) : Number(amount_paise);
      if (!Number.isInteger(amount) || amount <= 0 || amount > Number(o.left)) {
        throw new AppError(`Refund must be between 1 and ${o.left} paise`, 400);
      }
      const r = await recordRefund(client, { orderId: order_id, amountPaise: amount, source: 'admin', userId: req.user!.id });
      await writeAuditTx(client, { userId: null, action: 'refund_initiated', performedBy: req.user!.id,
        newValue: { order_id, amount_paise: amount }, notes: reason });
      return r;
    });
    await sendGatewayRefunds(refund.gatewayRefundIds);
    res.json({ success: true, message: 'Refund recorded', data: { refunds: refund.legs } });
  } catch (error) {
    next(error);
  }
}
