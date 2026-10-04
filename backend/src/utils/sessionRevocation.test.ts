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

describe('Sprint 48: sessions ended by a super-admin', () => {
  const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  it('a token from before sessions_revoked_at no longer opens the account; the password message wins', () => {
    const { sessionEndedMessage } = require('./jwt');
    const at = '2026-10-04T10:00:05Z';
    expect(sessionEndedMessage(sec('2026-10-04T09:00:00Z'), { sessions_revoked_at: at })).toMatch(/ended by Dawabag/);
    expect(sessionEndedMessage(sec('2026-10-04T10:05:00Z'), { sessions_revoked_at: at })).toBeNull();
    expect(sessionEndedMessage(sec('2026-10-04T09:00:00Z'), { password_changed_at: at, sessions_revoked_at: at })).toMatch(/password was changed/);
    expect(sessionEndedMessage(sec('2026-10-04T09:00:00Z'), {})).toBeNull();
  });
});
