// Security review Sprint 34 — changing the password ends every older session
import { issuedBeforePasswordChange } from './jwt';

describe('tokens issued before a password change', () => {
  const changed = new Date('2026-10-02T10:00:05.700Z');
  const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  it('are refused', () => {
    expect(issuedBeforePasswordChange(sec('2026-10-02T09:59:00Z'), changed)).toBe(true);
    expect(issuedBeforePasswordChange(sec('2026-10-02T10:00:04.999Z'), changed)).toBe(true);
  });
  it('a token from the same second or later (the new session) still works', () => {
    expect(issuedBeforePasswordChange(sec('2026-10-02T10:00:05.900Z'), changed)).toBe(false);
    expect(issuedBeforePasswordChange(sec('2026-10-02T10:01:00Z'), changed)).toBe(false);
  });
  it('an account that never changed its password is not affected', () => {
    expect(issuedBeforePasswordChange(sec('2020-01-01T00:00:00Z'), null)).toBe(false);
    expect(issuedBeforePasswordChange(undefined, changed)).toBe(false);
  });
});
