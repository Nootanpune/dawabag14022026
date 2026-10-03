// Who signs in with a second step, and when (Sprint 42; security review Sprints 35–40 #16;
// C-41, C-43, C-46). Pure rules, unit-tested in policy.test.ts.
//
// Logins that can change orders, stock, prices, registers or settings: super-admin, admin,
// Dawabag pharmacists and packers, and EVERY partner login (developer's recommendation: a
// partner's staff logins release shipments and send stock too, not only its owner).
// Buyers, doctors and delivery riders are not asked.
//
// The super-admin setting `security.two_factor` decides enforcement (owner decision pending):
//   optional (default) — each person may switch it on; once on, every sign-in asks for it;
//   required           — anyone in these roles without it must set it up at their next
//                        sign-in before any session is issued, and cannot switch it off.
// Signing in by SMS code and "Forgot password" never skip it: the password (or SMS code)
// is the first step, the authenticator code the second; tokens and the cookie are issued
// only after the second.

export const TWO_FACTOR_ROLES = ['super_admin', 'admin', 'pharmacist_rx', 'pharmacist_pack', 'partner'] as const;
export const TWO_FACTOR_SETTING = 'security.two_factor';
export const TWO_FACTOR_POLICIES = ['optional', 'required'] as const;
export type TwoFactorPolicy = (typeof TWO_FACTOR_POLICIES)[number];

export const appliesToRole = (role: string | null | undefined) => (TWO_FACTOR_ROLES as readonly string[]).includes(String(role));

/** The stored setting, read safely: anything but 'required' is optional. */
export const policyFrom = (value: unknown): TwoFactorPolicy => (value === 'required' ? 'required' : 'optional');

/** What happens after the first step: a session, the code step, or enrolment first. */
export type SignInStep = 'session' | 'code' | 'enrol';
export function signInStep(role: string, enrolled: boolean, policy: TwoFactorPolicy): SignInStep {
  if (!appliesToRole(role)) return 'session';
  if (enrolled) return 'code';
  return policy === 'required' ? 'enrol' : 'session';
}

/**
 * Whether a refresh token may be renewed: a session opened without the second step stops
 * at its next renewal once the person has two-step sign-in, or once it is required for
 * them (they sign in again and are asked for it).
 */
export function sessionMayContinue(role: string, enrolled: boolean, policy: TwoFactorPolicy, sessionHadSecondStep: boolean): boolean {
  if (!appliesToRole(role) || sessionHadSecondStep) return true;
  return !enrolled && policy !== 'required';
}

/** Switching it off is for people it is optional for. */
export const mayDisable = (role: string, policy: TwoFactorPolicy) => !(appliesToRole(role) && policy === 'required');

// Attempt limits: wrong codes per login, then a pause; a challenge lives a few minutes
export const MAX_WRONG_CODES = 5;
export const WRONG_CODE_WINDOW_SECONDS = 15 * 60;
export const CODE_CHALLENGE_SECONDS = 5 * 60;
export const ENROL_CHALLENGE_SECONDS = 15 * 60;
