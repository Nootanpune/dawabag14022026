// Sprint 42 — who is asked for the second step, and when a session without it ends.
import { appliesToRole, mayDisable, policyFrom, sessionMayContinue, signInStep } from './policy';

describe('two-step sign-in policy', () => {
  it('applies to admins, pharmacists, packers and every partner login — not buyers, doctors or riders', () => {
    for (const r of ['super_admin', 'admin', 'pharmacist_rx', 'pharmacist_pack', 'partner']) expect(appliesToRole(r)).toBe(true);
    for (const r of ['customer', 'doctor', 'delivery', 'pharmacy', '', undefined]) expect(appliesToRole(r as any)).toBe(false);
  });
  it('anything but "required" is optional', () => {
    expect(policyFrom('required')).toBe('required');
    for (const v of ['optional', null, undefined, 'REQUIRED', true]) expect(policyFrom(v)).toBe('optional');
  });
  it('after the first step: enrolled → code; required and not enrolled → enrol; otherwise a session', () => {
    expect(signInStep('admin', true, 'optional')).toBe('code');
    expect(signInStep('admin', true, 'required')).toBe('code');
    expect(signInStep('partner', false, 'required')).toBe('enrol');
    expect(signInStep('pharmacist_rx', false, 'optional')).toBe('session');
    expect(signInStep('customer', true, 'required')).toBe('session');
  });
  it('a session without the second step is not renewed once it applies', () => {
    expect(sessionMayContinue('admin', false, 'optional', false)).toBe(true);
    expect(sessionMayContinue('admin', true, 'optional', false)).toBe(false);
    expect(sessionMayContinue('admin', false, 'required', false)).toBe(false);
    expect(sessionMayContinue('admin', true, 'required', true)).toBe(true);
    expect(sessionMayContinue('customer', false, 'required', false)).toBe(true);
  });
  it('can be switched off only where it is optional', () => {
    expect(mayDisable('admin', 'optional')).toBe(true);
    expect(mayDisable('admin', 'required')).toBe(false);
  });
});
