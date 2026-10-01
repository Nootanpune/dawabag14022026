// src/controllers/payment.controller.ts — checkout, Razorpay webhooks, admin refunds.
// The work is in services/payments/* and refund.service.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { validWebhookSignature } from '../services/razorpay.client';
import { createOrderPayment, verifyOrderPayment } from '../services/payments/checkout.service';
import { handleWebhookEvent } from '../services/payments/webhook.service';
import { adminRefund } from '../services/refund.service';

const signed = z.object({ razorpay_order_id: z.string().min(5), razorpay_payment_id: z.string().min(5), razorpay_signature: z.string().min(10) });

export async function createPaymentOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id } = z.object({ order_id: z.string().uuid() }).parse(req.body);
    res.json({ success: true, data: await createOrderPayment(req.user!.id, order_id) });
  } catch (e) { next(e); }
}

export async function verifyPayment(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, message: 'Payment verified and order confirmed', data: await verifyOrderPayment(req.user!.id, signed.parse(req.body)) });
  } catch (e) { next(e); }
}

// Never act on an unsigned or mis-signed webhook (it could mark orders paid)
export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!validWebhookSignature(rawBody, req.headers['x-razorpay-signature'] as string | undefined)) {
      logger.warn('Rejected Razorpay webhook: missing secret or invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }
    const r = await handleWebhookEvent(req.headers['x-razorpay-event-id'] as string | undefined, rawBody!, req.body);
    logger.info(`Razorpay webhook ${req.body?.event}: ${r.duplicate ? 'duplicate' : r.outcome}`);
    res.json({ status: 'ok', ...r });
  } catch (e) { next(e); }
}

export async function initiateRefund(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ order_id: z.string().uuid(), amount_paise: z.number().int().positive().optional(), reason: z.string().max(500).optional() }).parse(req.body);
    res.json({ success: true, message: 'Refund recorded', data: { refunds: await adminRefund(req.user!.id, d.order_id, d.amount_paise, d.reason) } });
  } catch (e) { next(e); }
}
