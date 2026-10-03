import { dispositionProblems, effectiveKind, eventInputProblems, gdpSellableSql, holdMessage, outsideColdRange, receivedStorageCondition, statusAfter } from './rules';

describe('GDP rules (Sprint 40, C-25)', () => {
  it('2–8 °C is the cold-chain range', () => {
    expect(outsideColdRange(2)).toBe(false);
    expect(outsideColdRange(8)).toBe(false);
    expect(outsideColdRange(1.9)).toBe(true);
    expect(outsideColdRange(8.5)).toBe(true);
  });
  it('a cold-chain reading outside the range is an excursion; a room-temperature product is not', () => {
    expect(effectiveKind('temperature_reading', true, 11)).toBe('excursion');
    expect(effectiveKind('temperature_reading', true, 5)).toBe('temperature_reading');
    expect(effectiveKind('temperature_reading', false, 11)).toBe('temperature_reading');
    expect(effectiveKind('storage_check', true, 20)).toBe('storage_check');
  });
  it('checks what a person records', () => {
    expect(eventInputProblems({ event_kind: 'received' })).toHaveLength(1);
    expect(eventInputProblems({ event_kind: 'temperature_reading' })).toEqual(['Enter the temperature read (°C)']);
    expect(eventInputProblems({ event_kind: 'temperature_reading', temperature_c: 200 })[0]).toMatch(/between -80 and 80/);
    expect(eventInputProblems({ event_kind: 'excursion', notes: 'hot' })[0]).toMatch(/Describe the excursion/);
    expect(eventInputProblems({ event_kind: 'excursion', notes: 'Fridge door open 2 h, 12 °C' })).toEqual([]);
    expect(eventInputProblems({ event_kind: 'transfer' })[0]).toMatch(/moved to/);
    expect(eventInputProblems({ event_kind: 'storage_check', notes: 'ok' })).toEqual([]);
  });
  it('a release needs a real justification; every disposition needs a reason', () => {
    expect(dispositionProblems({ disposition: 'keep' })).toEqual(['Choose release, quarantine or destroy']);
    expect(dispositionProblems({ disposition: 'release', justification: 'looks fine' })[0]).toMatch(/at least 20/);
    expect(dispositionProblems({ disposition: 'release', justification: 'Logger shows 9 °C for 20 min; stability data allows 25 °C for 24 h' })).toEqual([]);
    expect(dispositionProblems({ disposition: 'destroy', justification: 'short' })[0]).toMatch(/at least 10/);
    expect(dispositionProblems({ disposition: 'quarantine', justification: 'Awaiting maker data' })).toEqual([]);
  });
  it('the batch standing after a decision', () => {
    expect(statusAfter('release')).toBe('ok');
    expect(statusAfter('quarantine')).toBe('quarantined');
    expect(statusAfter('destroy')).toBe('destroyed');
    expect(holdMessage('ok', 'X')).toBeNull();
    expect(holdMessage('on_hold', 'Insulin B1')).toMatch(/pharmacist's disposition/);
  });
  it('buyer paths read one condition; GRN storage condition', () => {
    expect(gdpSellableSql('ib')).toBe("ib.gdp_status = 'ok'");
    expect(receivedStorageCondition(true, null)).toBe('Refrigerated 2–8 °C');
    expect(receivedStorageCondition(false, '')).toMatch(/below 30/);
    expect(receivedStorageCondition(true, 'Store at 2–8 °C, do not freeze')).toBe('Store at 2–8 °C, do not freeze');
  });
});
