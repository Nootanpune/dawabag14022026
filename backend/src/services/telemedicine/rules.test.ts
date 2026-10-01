import { allowedLists, consultKind, refusal } from './rules';

const med = (list: any, schedule = 'Schedule H') => ({ name: 'M', drug_schedule: schedule, telemedicine_list: list });

describe('telemedicine rules (TPG 2020)', () => {
  it('first video consult: lists O and A', () => expect(allowedLists('first', 'video')).toEqual(['O', 'A']));
  it('first audio or text consult: list O only', () => {
    expect(allowedLists('first', 'audio')).toEqual(['O']);
    expect(allowedLists('first', 'text')).toEqual(['O']);
  });
  it('follow-up: O, A and B in any mode', () => expect(allowedLists('follow_up', 'text')).toEqual(['O', 'A', 'B']));
  it('Schedule X and NDPS are never allowed, whatever the list says', () => {
    expect(refusal(med('O', 'NDPS'), 'follow_up', 'video')).toMatch(/never/);
    expect(refusal(med('prohibited'), 'follow_up', 'video')).toMatch(/never/);
  });
  it('unclassified medicines are refused', () => expect(refusal(med(null), 'follow_up', 'video')).toMatch(/classify/));
  it('list A by audio on a first consult is refused; by video it is allowed', () => {
    expect(refusal(med('A'), 'first', 'audio')).toMatch(/video/);
    expect(refusal(med('A'), 'first', 'video')).toBeNull();
  });
  it('list B only in a follow-up', () => {
    expect(refusal(med('B'), 'first', 'video')).toMatch(/follow-up/);
    expect(refusal(med('B'), 'follow_up', 'audio')).toBeNull();
  });
  it('follow-up within the window with the same doctor, unless a new condition', () => {
    const now = new Date('2026-10-01');
    expect(consultKind(new Date('2026-09-01'), 180, false, now)).toBe('follow_up');
    expect(consultKind(new Date('2026-01-01'), 180, false, now)).toBe('first');
    expect(consultKind(new Date('2026-09-01'), 180, true, now)).toBe('first');
    expect(consultKind(null, 180, false, now)).toBe('first');
  });
});
