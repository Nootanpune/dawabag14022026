import { HEALTH_CONSENT_PURPOSE, HEALTH_CONSENT_VERSION, ageNow, cleanList, consentProblem, memberSchema, profileSchema } from './rules';

describe('health profile rules (Sprint 33)', () => {
  it('needs consent before anything is saved (C-41)', () => {
    expect(consentProblem(false, undefined)).toMatch(/Tick the consent box/);
    expect(consentProblem(false, false)).toMatch(/Tick the consent box/);
    expect(consentProblem(false, true)).toBeNull();
    expect(consentProblem(true, undefined)).toBeNull();
  });

  it('states the purpose and fits the consent log', () => {
    expect(HEALTH_CONSENT_PURPOSE).toMatch(/pharmacists/);
    expect(HEALTH_CONSENT_PURPOSE).toMatch(/delete it at any time/);
    expect(HEALTH_CONSENT_VERSION.length).toBeLessThanOrEqual(20);   // consent_records.policy_version
  });

  it('cleans lists: trims, drops blanks and repeats', () => {
    expect(cleanList([' Penicillin ', 'penicillin', '', 'Sulpha  drugs'])).toEqual(['Penicillin', 'Sulpha drugs']);
  });

  it('works out today’s age from the age entered', () => {
    expect(ageNow(42, '2026-10-02', '2026-10-02')).toBe(42);
    expect(ageNow(42, '2026-10-02', '2027-10-01')).toBe(42);
    expect(ageNow(42, '2026-10-02', '2027-10-02')).toBe(43);
    expect(ageNow(null, null, '2027-10-02')).toBeNull();
    expect(ageNow(120, '2020-01-01', '2030-01-01')).toBe(120);
  });

  it('validates the forms', () => {
    expect(() => profileSchema.parse({ allergies: Array(31).fill('a') })).toThrow(/At most 30/);
    expect(() => profileSchema.parse({ blood_group: 'O+' })).toThrow();
    expect(() => memberSchema.parse({ full_name: 'Asha', relationship: 'mother', age_years: 130 })).toThrow(/0 to 120/);
    expect(memberSchema.parse({ full_name: 'Asha', relationship: 'mother', age_years: 64 })).toMatchObject({ allergies: [], conditions: [] });
  });
});
