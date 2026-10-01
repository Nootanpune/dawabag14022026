import { courierTime, normaliseStatus } from './status';

describe('normaliseStatus', () => {
  it.each([
    ['OUT FOR DELIVERY', 'out_for_delivery'], ['Delivered', 'delivered'], ['RTO INITIATED', 'rto'], ['RTO DELIVERED', 'rto'],
    ['UNDELIVERED', 'exception'], ['PICKED UP', 'picked_up'], ['IN TRANSIT', 'in_transit'], ['Reached at Destination Hub', 'in_transit'],
  ])('%s → %s', (raw, want) => expect(normaliseStatus(raw)).toBe(want));
});

describe('courierTime', () => {
  it('reads zone-less times as IST', () => {
    expect(courierTime('2026-10-01 14:05:00')?.toISOString()).toBe('2026-10-01T08:35:00.000Z');
    expect(courierTime('01 10 2026 14:05:00')?.toISOString()).toBe('2026-10-01T08:35:00.000Z');
  });
  it('keeps an explicit zone', () => expect(courierTime('2026-10-01T14:05:00Z')?.toISOString()).toBe('2026-10-01T14:05:00.000Z'));
  it('rejects junk', () => { expect(courierTime('soon')).toBeNull(); expect(courierTime(undefined)).toBeNull(); });
});
