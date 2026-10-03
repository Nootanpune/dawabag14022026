import {
  DEFAULT_RX_HOLD, GATEWAY_MAX_EXPIRY_MINUTES, RELEASE_MARGIN_MINUTES, authorisationGone, captureReadiness, gatewayCaptureOptions,
  holdAction, holdTimes, parseRxHoldSettings,
} from './rules';

describe('authorise-then-capture rules (Sprint 39, C-08, C-37)', () => {
  it('defaults: alert at 48 h, release at 72 h, gateway window 5 days', () => {
    expect(parseRxHoldSettings(undefined)).toEqual(DEFAULT_RX_HOLD);
    expect(DEFAULT_RX_HOLD).toEqual({ alert_after_hours: 48, release_after_hours: 72, gateway_expiry_minutes: 7200 });
  });

  it('whatever is stored, release comes before the gateway window and the alert before release', () => {
    const s = parseRxHoldSettings({ alert_after_hours: 500, release_after_hours: 500, gateway_expiry_minutes: 99999 });
    expect(s.gateway_expiry_minutes).toBe(GATEWAY_MAX_EXPIRY_MINUTES);
    expect(s.release_after_hours * 60).toBeLessThanOrEqual(s.gateway_expiry_minutes - RELEASE_MARGIN_MINUTES);
    expect(s.alert_after_hours).toBeLessThan(s.release_after_hours);
    const short = parseRxHoldSettings({ gateway_expiry_minutes: 60 });
    expect(short.gateway_expiry_minutes).toBe(24 * 60);
    expect(short.release_after_hours).toBeLessThanOrEqual(22);
  });

  it('hold times from the authorisation', () => {
    const at = new Date('2026-10-03T00:00:00Z');
    const t = holdTimes(at, DEFAULT_RX_HOLD);
    expect(t.alertAt.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(t.releaseDueAt.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(t.gatewayExpiresAt.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('asks Razorpay for manual capture only for prescription orders', () => {
    expect(gatewayCaptureOptions(false, DEFAULT_RX_HOLD)).toEqual({ payment_capture: true });
    expect(gatewayCaptureOptions(true, DEFAULT_RX_HOLD)).toEqual({ payment: { capture: 'manual',
      capture_options: { automatic_expiry_period: 12, manual_expiry_period: 7200, refund_speed: 'normal' } } });
  });

  it('captures only when every prescription part is released', () => {
    const base = { paymentStatus: 'authorized', orderStatus: 'rx_verified', rxLinesWaiting: 0, rxShipments: [{ status: 'pending', pharmacist_check: 'released' }] };
    expect(captureReadiness(base)).toEqual({ ready: true });
    expect(captureReadiness({ ...base, rxLinesWaiting: 1 }).ready).toBe(false);
    expect(captureReadiness({ ...base, rxShipments: [...base.rxShipments, { status: 'pending', pharmacist_check: 'pending' }] }).ready).toBe(false);
    expect(captureReadiness({ ...base, rxShipments: [...base.rxShipments, { status: 'cancelled', pharmacist_check: 'rejected' }] }).ready).toBe(true);
    expect(captureReadiness({ ...base, orderStatus: 'rx_pending' }).ready).toBe(false);
    expect(captureReadiness({ ...base, orderStatus: 'cancelled' }).ready).toBe(false);
    expect(captureReadiness({ ...base, paymentStatus: 'released' }).ready).toBe(false);
  });

  it('the watch: nothing, then alert once, then release', () => {
    const at = new Date('2026-10-03T00:00:00Z');
    const p = { authorised_at: at, release_due_at: holdTimes(at, DEFAULT_RX_HOLD).releaseDueAt, hold_alerted_at: null as Date | null };
    expect(holdAction(new Date('2026-10-04T00:00:00Z'), p, DEFAULT_RX_HOLD)).toBe('none');
    expect(holdAction(new Date('2026-10-05T01:00:00Z'), p, DEFAULT_RX_HOLD)).toBe('alert');
    expect(holdAction(new Date('2026-10-05T01:00:00Z'), { ...p, hold_alerted_at: new Date() }, DEFAULT_RX_HOLD)).toBe('none');
    expect(holdAction(new Date('2026-10-06T00:00:01Z'), p, DEFAULT_RX_HOLD)).toBe('release');
  });

  it('knows when the gateway has given the authorisation back', () => {
    expect(authorisationGone('refunded')).toBe(true);
    expect(authorisationGone('authorized')).toBe(false);
    expect(authorisationGone('captured')).toBe(false);
  });
});
