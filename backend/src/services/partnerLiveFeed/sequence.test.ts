import { decideSequence, effectiveTakenAt, MAX_CLOCK_AHEAD_MS } from './sequence';

const now = new Date('2026-10-03T10:00:00Z');
const at = (min: number) => new Date(now.getTime() + min * 60_000);
const last = { sequence: 10, takenAt: at(-5), sha256: 'aaa' };

describe('live snapshot ordering (Sprint 37)', () => {
  it('applies the first snapshot of a partner', () => {
    expect(decideSequence({ sequence: null, takenAt: null, sha256: null }, { sequence: 1, takenAt: at(-1), sha256: 'x' }, now)).toEqual({ action: 'apply' });
  });
  it('a retry of the same snapshot is a replay that changes nothing', () => {
    expect(decideSequence(last, { sequence: 10, takenAt: at(-5), sha256: 'aaa' }, now).action).toBe('replay');
  });
  it('refuses a reused sequence with different stock', () => {
    const d = decideSequence(last, { sequence: 10, takenAt: at(-5), sha256: 'bbb' }, now);
    expect(d).toMatchObject({ action: 'reject', status: 409 });
  });
  it('refuses an older sequence (out of order)', () => {
    const d = decideSequence(last, { sequence: 9, takenAt: at(-1), sha256: 'bbb' }, now);
    expect(d).toMatchObject({ action: 'reject', status: 409 });
    if (d.action === 'reject') expect(d.message).toMatch(/Out of order/);
  });
  it('refuses a newer sequence taken before the applied one', () => {
    expect(decideSequence(last, { sequence: 11, takenAt: at(-6), sha256: 'bbb' }, now)).toMatchObject({ action: 'reject', status: 409 });
  });
  it('a newer snapshot with the same stock is "unchanged"; with new stock it applies', () => {
    expect(decideSequence(last, { sequence: 11, takenAt: at(-1), sha256: 'aaa' }, now).action).toBe('unchanged');
    expect(decideSequence(last, { sequence: 11, takenAt: at(-1), sha256: 'ccc' }, now).action).toBe('apply');
  });
  it('refuses a snapshot from a clock far in the future, accepts small drift', () => {
    expect(decideSequence(last, { sequence: 11, takenAt: new Date(now.getTime() + MAX_CLOCK_AHEAD_MS + 1000), sha256: 'c' }, now))
      .toMatchObject({ action: 'reject', status: 422 });
    expect(decideSequence(last, { sequence: 11, takenAt: at(2), sha256: 'c' }, now).action).toBe('apply');
  });
  it('records a slightly-ahead clock as the time of receipt', () => {
    expect(effectiveTakenAt(at(2), now)).toEqual(now);
    expect(effectiveTakenAt(at(-2), now)).toEqual(at(-2));
  });
});
