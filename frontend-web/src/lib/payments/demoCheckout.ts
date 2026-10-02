// The trial's demo checkout (Sprint 27): the same steps as Razorpay's window — choose a
// way to pay, then that method's own step, then an approve/decline screen — with no money
// moving. Nothing here is real payment data: the card is a fixed test card shown read-only
// and never sent; the QR is a drawing, not a payable code; only the method and the bank or
// wallet name reach the server (audit, C-46).
import type { DemoChoice, PaymentMethod } from './api';

/** The answer to "Approve / Decline": paid, not paid (declined), or the request failed. */
export type DemoOutcome = 'paid' | 'not_paid' | 'error';
export type DemoPay = (choice: DemoChoice, outcome: 'success' | 'failure') => Promise<DemoOutcome>;

export const DEMO_VPA = 'demo@upi';
/** name@handle, as UPI ids are written (e.g. ravi.k@okbank) */
export const isValidVpa = (v: string) => /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$/i.test(v.trim());

/** A well-known test card number (accepted by no bank). Shown read-only; never sent. */
export const DEMO_CARD = { number: '4111 1111 1111 1111', last4: '1111', cvv: '123', name: 'Demo Customer' } as const;
export function demoCardExpiry(now = new Date()): string {
  const yy = String((now.getFullYear() + 3) % 100).padStart(2, '0');
  return `12/${yy}`;
}
export const DEMO_OTP = '123456';
/** How long the UPI request waits for approval (seconds) */
export const UPI_WAIT_SECONDS = 120;

/** How the confirmation names the payment, e.g. "HDFC netbanking (demo)". */
export function paidByLabel(c: DemoChoice): string {
  switch (c.method) {
    case 'upi': return 'Paid by UPI (demo)';
    case 'card': return `Card ending ${DEMO_CARD.last4} (demo)`;
    case 'netbanking': return `${c.provider ?? 'Bank'} netbanking (demo)`;
    case 'wallet': return `${c.provider ?? 'Wallet'} (demo)`;
  }
}

export const METHOD_STEP_TITLES: Record<PaymentMethod, string> = {
  upi: 'Pay by UPI', card: 'Pay by card', netbanking: 'Pay by netbanking', wallet: 'Pay from a wallet',
};

export const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
