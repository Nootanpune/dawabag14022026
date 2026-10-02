// src/controllers/paymentOptions.controller.ts — how this server takes payment
// (Razorpay, a trial's demo payment, or not available) and the demo payment itself
// (Sprint 26; payments/paymentMode.ts, payments/demoPayment.service.ts).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PAYMENT_METHODS, paymentMode } from '../services/payments/paymentMode';
import { payConsultationDemo, payOrderDemo } from '../services/payments/demoPayment.service';

const demoBody = z.object({
  method: z.enum(PAYMENT_METHODS).default('upi'),
  outcome: z.enum(['success', 'failure']).default('success'),
});

export function getPaymentOptions(_req: Request, res: Response) {
  const mode = paymentMode();
  // No cash on delivery: every order is paid online before dispatch
  res.json({ success: true, data: { mode, methods: mode === 'unavailable' ? [] : PAYMENT_METHODS, cash_on_delivery: false } });
}

export async function postDemoOrderPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id, ...input } = demoBody.extend({ order_id: z.string().uuid() }).parse(req.body);
    const data = await payOrderDemo(req.user!.id, order_id, input);
    res.json({ success: true, message: data.paid ? 'Demo payment recorded — no money moved' : 'Demo payment failed (simulated)', data });
  } catch (e) { next(e); }
}

export async function postDemoConsultationPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const data = await payConsultationDemo(req.user!.id, id, demoBody.parse(req.body ?? {}));
    res.json({ success: true, data });
  } catch (e) { next(e); }
}
