// src/services/razorpay.client.ts — one Razorpay client for the whole API
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { AppError } from '../utils/AppError';

let client: Razorpay | null = null;

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpay(): Razorpay {
  if (!razorpayConfigured()) throw new AppError('Online payment is not available right now. Please try again later.', 503);
  if (!client) {
    client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
    // Tests only (production refuses it, config/env.ts): point the SDK at a fake gateway
    if (process.env.RAZORPAY_BASE_URL) (client as any).api.rq.defaults.baseURL = process.env.RAZORPAY_BASE_URL;
  }
  return client;
}

// Webhook signature over the exact raw bytes Razorpay sent (not re-serialised JSON)
export function validWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Checkout signature: HMAC-SHA256 of "<order id>|<payment id>" with the key secret
export function validCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!process.env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
