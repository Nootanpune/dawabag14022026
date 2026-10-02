// Sprint 34 — dose reminder answers, ended reminders and (only if set) inactive health profiles are purged (C-44)
import { RETENTION_KEYS, retentionMinDays } from './retention.service';
import { HEALTH_NOTE_ORDER_STATUSES } from './healthProfile/healthProfile.service';

describe('retention keys', () => {
  it('include the Sprint 33 health-related data', () => {
    expect(RETENTION_KEYS).toEqual(expect.arrayContaining(['reminder_dose_logs', 'ended_reminders', 'inactive_health_profiles']));
  });
  it('health profiles can never be set to go sooner than a year of inactivity; others 30 days (webhooks 180)', () => {
    expect(retentionMinDays('inactive_health_profiles')).toBe(365);
    expect(retentionMinDays('reminder_dose_logs')).toBe(30);
    expect(retentionMinDays('payment_webhook_events')).toBe(180);
  });
});

describe('pharmacist health note (Sprint 34 review)', () => {
  it('only for orders still being checked or packed', () => {
    expect(HEALTH_NOTE_ORDER_STATUSES).toEqual(expect.arrayContaining(['rx_pending', 'packing']));
    for (const s of ['delivered', 'cancelled', 'returned', 'dispatched']) expect(HEALTH_NOTE_ORDER_STATUSES).not.toContain(s);
  });
});
