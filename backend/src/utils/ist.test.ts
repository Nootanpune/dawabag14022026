import { formatDateIST, formatDateTimeIST, istYear, todayIST } from './ist';

describe('India Standard Time helpers', () => {
  it('a new day starts at midnight in India, 18:30 UTC the day before', () => {
    expect(todayIST(new Date('2026-09-30T18:29:59Z'))).toBe('2026-09-30');
    expect(todayIST(new Date('2026-09-30T18:30:00Z'))).toBe('2026-10-01');
  });
  it('the year turns at midnight in India', () => {
    expect(istYear(new Date('2026-12-31T18:30:00Z'))).toBe(2027);
  });
  it('DATE values (UTC midnight) keep their day; instants show in IST', () => {
    expect(formatDateIST('2026-10-01')).toBe('01 Oct 2026');
    expect(formatDateTimeIST('2026-10-01T20:00:00Z')).toMatch(/^02 Oct 2026, 1:30 am IST$/i);
  });
});
