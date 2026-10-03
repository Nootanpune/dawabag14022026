// src/controllers/paymentOptions.controller.ts — how this server takes payment
// (Razorpay, a trial's demo payment, or not available) and the demo payment itself
// (Sprint 26; payments/paymentMode.ts, payments/demoPayment.service.ts).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DEMO_PROVIDERS, PAYMENT_METHODS, demoProviderValid, paymentMode } from '../services/payments/paymentMode';
import { payConsultationDemo, payEditDemo, payOrderDemo } from '../services/payments/demoPayment.service';

const demoBody = z.object({
  method: z.enum(PAYMENT_METHODS).default('upi'),
  outcome: z.enum(['success', 'failure']).default('success'),
  // The bank or wallet chosen in the demo checkout (Sprint 27); audit only, never card data
  provider: z.string().max(40).optional(),
});
const checked = <T extends { method: (typeof PAYMENT_METHODS)[number]; provider?: string }>(b: T) => {
  if (!demoProviderValid(b.method, b.provider)) {
    throw new z.ZodError([{ code: 'custom', path: ['provider'], message: 'Choose one of the listed banks or wallets' }]);
  }
  return b;
};

export function getPaymentOptions(_req: Request, res: Response) {
  const mode = paymentMode();
  // No cash on delivery: every order is paid online before dispatch
  res.json({ success: true, data: { mode, methods: mode === 'unavailable' ? [] : PAYMENT_METHODS, cash_on_delivery: false,
    // the demo checkout's banks and wallets (names only; no bank or wallet is contacted)
    ...(mode === 'demo' ? { providers: DEMO_PROVIDERS } : {}) } });
}

export async function postDemoOrderPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id, order_edit_id, ...input } = checked(demoBody.extend({ order_id: z.string().uuid(), order_edit_id: z.string().uuid().optional() }).parse(req.body));
    // Sprint 44: order_edit_id = the difference for an order change
    const data = order_edit_id ? await payEditDemo(req.user!.id, order_id, order_edit_id, input) : await payOrderDemo(req.user!.id, order_id, input);
    res.json({ success: true, message: data.paid ? 'Demo payment recorded — no money moved' : 'Demo payment failed (simulated)', data });
  } catch (e) { next(e); }
}

export async function postDemoConsultationPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const data = await payConsultationDemo(req.user!.id, id, checked(demoBody.parse(req.body ?? {})));
    res.json({ success: true, data });
  } catch (e) { next(e); }
}
