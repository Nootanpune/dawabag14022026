import { adherence, dosesBetween, isDoseTime, istInstant, normaliseTime, normaliseTimes, reminderInputSchema, tapWindowProblem } from './schedule';

const r = { id: 'r1', times: ['08:00', '20:00'], start_date: '2026-10-05', end_date: '2026-10-06', is_active: true };

describe('dose reminder schedule (Sprint 33)', () => {
  it('reads times of day', () => {
    expect(normaliseTime('8:00')).toBe('08:00');
    expect(normaliseTime('21:30')).toBe('21:30');
    expect(normaliseTime('24:00')).toBeNull();
    expect(normaliseTime('8 am')).toBeNull();
    expect(normaliseTimes(['20:00', '8:00', '08:00'])).toEqual(['08:00', '20:00']);
    expect(() => normaliseTimes(['25:00'])).toThrow(/not a time of day/);
    expect(() => normaliseTimes(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'])).toThrow(/At most 6/);
  });

  it('turns an Indian time into the right instant', () => {
    expect(istInstant('2026-10-05', '08:00').toISOString()).toBe('2026-10-05T02:30:00.000Z');
    expect(istInstant('2026-10-05', '00:15').toISOString()).toBe('2026-10-04T18:45:00.000Z');
  });

  it('lists the doses between two moments, within the start and end dates', () => {
    const doses = dosesBetween(r, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-10T00:00:00Z'));
    expect(doses.map((d) => d.at.toISOString())).toEqual([
      '2026-10-05T02:30:00.000Z', '2026-10-05T14:30:00.000Z', '2026-10-06T02:30:00.000Z', '2026-10-06T14:30:00.000Z']);
    expect(dosesBetween({ ...r, is_active: false }, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-10T00:00:00Z'))).toEqual([]);
    const open = dosesBetween({ ...r, end_date: null }, new Date('2026-10-05T03:00:00Z'), new Date('2026-10-06T03:00:00Z'));
    expect(open.map((d) => d.time)).toEqual(['20:00', '08:00']);
  });

  it('accepts a Taken / Skipped tap only for a real dose, not far in the future or past', () => {
    expect(isDoseTime(r, new Date('2026-10-05T14:30:00Z'))).toBe(true);
    expect(isDoseTime(r, new Date('2026-10-05T14:31:00Z'))).toBe(false);
    expect(isDoseTime(r, new Date('2026-10-07T02:30:00Z'))).toBe(false);    // after the end date
    const now = new Date('2026-10-05T12:00:00Z');
    expect(tapWindowProblem(new Date('2026-10-05T14:30:00Z'), now)).toBeNull();
    expect(tapWindowProblem(new Date('2026-10-06T14:30:00Z'), now)).toMatch(/not due yet/);
    expect(tapWindowProblem(new Date('2026-09-20T14:30:00Z'), now)).toMatch(/older than 7 days/);
  });

  it('counts taken, skipped and not answered doses that are already due', () => {
    const doses = dosesBetween(r, new Date('2026-10-05T00:00:00Z'), new Date('2026-10-07T00:00:00Z'));
    const c = adherence(doses, [
      { scheduled_for: new Date('2026-10-05T02:30:00Z'), status: 'taken' },
      { scheduled_for: new Date('2026-10-05T14:30:00Z'), status: 'skipped' },
    ], new Date('2026-10-06T10:00:00Z'));
    expect(c).toEqual({ taken: 1, skipped: 1, missed: 1, total: 3 });
  });

  it('validates the reminder form', () => {
    expect(() => reminderInputSchema.parse({ medicine_name: 'P', times: ['08:00'] })).toThrow(/Name the medicine/);
    expect(() => reminderInputSchema.parse({ medicine_name: 'Paracetamol', times: [] })).toThrow(/at least one time/);
    expect(() => reminderInputSchema.parse({ medicine_name: 'Paracetamol', times: ['08:00'], colour: 'red' })).toThrow();
    expect(reminderInputSchema.parse({ medicine_name: 'Paracetamol 650', times: ['08:00'], dose: '1 tablet' }).dose).toBe('1 tablet');
  });
});
