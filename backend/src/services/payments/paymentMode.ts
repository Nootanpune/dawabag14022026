// How a buyer pays on this server (Sprint 26):
//   'razorpay'    — Razorpay keys set: Checkout opens with UPI, cards, netbanking, wallets
//   'demo'        — the owner's trial (APP_ENV=trial) without Razorpay keys: a clearly
//                   labelled demo payment, no money moves (services/payments/demoPayment.service)
//   'unavailable' — anywhere else without keys: the buyer is told online payment is not available
// The demo mode can never exist outside APP_ENV=trial: config/env.ts refuses DEMO_PAYMENTS
// elsewhere, and this check asks for APP_ENV=trial again at every call.
import { isTrial } from '../../config/env';

export type PaymentMode = 'razorpay' | 'demo' | 'unavailable';

export const PAYMENT_METHODS = ['upi', 'card', 'netbanking', 'wallet'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

const keysSet = (env: NodeJS.ProcessEnv) => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

/** Demo payments: only on a trial server, only without Razorpay keys, unless DEMO_PAYMENTS=false. */
export function demoPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTrial(env) && !keysSet(env) && env.DEMO_PAYMENTS !== 'false';
}

export function paymentMode(env: NodeJS.ProcessEnv = process.env): PaymentMode {
  if (keysSet(env)) return 'razorpay';
  return demoPaymentsEnabled(env) ? 'demo' : 'unavailable';
}

/** Ids the demo writes in place of Razorpay's (never sent to a gateway). */
export const DEMO_ORDER_PREFIX = 'demo_order_';
export const DEMO_PAYMENT_PREFIX = 'demo_pay_';
export const isDemoPaymentId = (id: string | null | undefined) => !!id && id.startsWith(DEMO_PAYMENT_PREFIX);
