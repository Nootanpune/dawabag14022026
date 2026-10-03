// Pure rules of authorise-then-capture for prescription orders (Sprint 39, owner
// decision 2026-10-03; Rulebook C-08 pharmacist check, C-37 never charge a refused buyer).
//
//   • An order with a line that needs a prescription for this buyer is AUTHORISED at
//     checkout (Razorpay manual capture; the demo simulates it) and captured only when
//     the pharmacist check has passed: no prescription line waiting and every shipment
//     holding a prescription line released.
//   • Mixed carts (OTC + prescription lines) are authorised and captured as ONE payment,
//     after the check — Razorpay captures the authorised amount in full (no partial
//     capture), and the order is placed, priced and invoiced as one.
//   • Refusal, cancellation or timeout releases the authorisation: Razorpay has no void
//     call, so the hold is simply never captured and goes back to the buyer when the
//     manual-capture window ends. The buyer is never charged.
//   • Timeout: staff are alerted after alert_after_hours; after release_after_hours an
//     order still unchecked is cancelled and released — always before the gateway's own
//     window (gateway_expiry_minutes, max 7200 = 5 days), so a capture can never be
//     attempted on an authorisation the gateway has already given back.
// No database or gateway imports: unit-tested in rules.test.ts.

export interface RxHoldSettings {
  alert_after_hours: number;
  release_after_hours: number;
  gateway_expiry_minutes: number;
}

/** Razorpay's longest manual-capture window (capture_options.manual_expiry_period). */
export const GATEWAY_MAX_EXPIRY_MINUTES = 7200;
/** Razorpay's shortest automatic window (capture_options.automatic_expiry_period). */
export const GATEWAY_MIN_AUTO_EXPIRY_MINUTES = 12;
/** Dawabag releases at least this long before the gateway would. */
export const RELEASE_MARGIN_MINUTES = 120;

export const DEFAULT_RX_HOLD: RxHoldSettings = { alert_after_hours: 48, release_after_hours: 72, gateway_expiry_minutes: GATEWAY_MAX_EXPIRY_MINUTES };

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

/** Read the setting safely: whatever is stored, release comes before the gateway window and the alert before release. */
export function parseRxHoldSettings(raw: unknown): RxHoldSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const gateway = Math.min(Math.max(Math.round(num(r.gateway_expiry_minutes, DEFAULT_RX_HOLD.gateway_expiry_minutes)), 24 * 60), GATEWAY_MAX_EXPIRY_MINUTES);
  const maxRelease = (gateway - RELEASE_MARGIN_MINUTES) / 60;
  const release = Math.min(num(r.release_after_hours, DEFAULT_RX_HOLD.release_after_hours), maxRelease);
  const alert = Math.min(num(r.alert_after_hours, DEFAULT_RX_HOLD.alert_after_hours), Math.max(release - 1, release / 2));
  return { alert_after_hours: alert, release_after_hours: release, gateway_expiry_minutes: gateway };
}

export interface HoldTimes { alertAt: Date; releaseDueAt: Date; gatewayExpiresAt: Date }

export function holdTimes(authorisedAt: Date, s: RxHoldSettings): HoldTimes {
  const t = authorisedAt.getTime();
  return {
    alertAt: new Date(t + s.alert_after_hours * 3_600_000),
    releaseDueAt: new Date(t + s.release_after_hours * 3_600_000),
    gatewayExpiresAt: new Date(t + s.gateway_expiry_minutes * 60_000),
  };
}

/** What Razorpay's Orders API is asked for (the per-order setting overrides the dashboard's). */
export function gatewayCaptureOptions(manual: boolean, s: RxHoldSettings): Record<string, unknown> {
  if (!manual) return { payment_capture: true };
  return {
    payment: {
      capture: 'manual',
      capture_options: {
        automatic_expiry_period: GATEWAY_MIN_AUTO_EXPIRY_MINUTES,
        manual_expiry_period: s.gateway_expiry_minutes,
        refund_speed: 'normal',
      },
    },
  };
}

export interface ReadinessInput {
  paymentStatus: string;
  orderStatus: string;
  /** prescription lines not yet covered by a verified prescription */
  rxLinesWaiting: number;
  /** shipments that hold at least one prescription line */
  rxShipments: { status: string; pharmacist_check: string }[];
}

/** Order states in which a held payment may be captured (paid-for work goes on). */
export const CAPTURABLE_ORDER_STATES = ['rx_verified', 'confirmed', 'packing'];

export type Readiness = { ready: true } | { ready: false; reason: string };

export function captureReadiness(i: ReadinessInput): Readiness {
  if (i.paymentStatus !== 'authorized') return { ready: false, reason: `payment is ${i.paymentStatus}` };
  if (!CAPTURABLE_ORDER_STATES.includes(i.orderStatus)) return { ready: false, reason: `order is ${i.orderStatus}` };
  if (i.rxLinesWaiting > 0) return { ready: false, reason: 'prescription not yet verified' };
  const live = i.rxShipments.filter((s) => s.status !== 'cancelled');
  if (live.some((s) => s.pharmacist_check !== 'released')) return { ready: false, reason: 'pharmacist check not yet passed' };
  return { ready: true };
}

export type HoldAction = 'none' | 'alert' | 'release';

/** The watch job's decision for one held payment. */
export function holdAction(now: Date, p: { authorised_at: Date; release_due_at: Date | null; hold_alerted_at: Date | null }, s: RxHoldSettings): HoldAction {
  const due = p.release_due_at ?? holdTimes(p.authorised_at, s).releaseDueAt;
  if (now >= due) return 'release';
  if (!p.hold_alerted_at && now >= holdTimes(p.authorised_at, s).alertAt) return 'alert';
  return 'none';
}

/** Gateway states that mean the authorisation is gone (given back or never usable). */
export function authorisationGone(gatewayStatus: string | undefined): boolean {
  return gatewayStatus === 'refunded' || gatewayStatus === 'failed' || gatewayStatus === 'voided';
}

/** Buyer-facing words, shared by web, app notifications and the API. */
export const HOLD_WORDING = {
  checkout: "You'll only be charged after our pharmacist checks your prescription.",
  released: 'You have not been charged. The amount held on your card or UPI is not taken: it is released automatically within 5 days (your bank may take a few more days to show it).',
  timeout: 'Our pharmacist could not complete the check in time.',
} as const;
