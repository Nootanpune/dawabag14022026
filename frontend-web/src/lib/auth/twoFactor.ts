// Two-step sign-in with an authenticator app (Sprint 42; C-41, C-43). After the password
// (or an SMS code, or "Forgot password") a staff or partner login with two-step sign-in
// gets a challenge instead of a session; the session (httpOnly cookie + access token in
// memory) comes only after the authenticator code. Nothing is kept in the browser: the
// challenge lives in React state for the few minutes the server allows.
import api from '../api';
import type { AuthResponseData } from '../session';

/** What /auth/login, /auth/verify-otp and /auth/reset-password answer instead of a session. */
export interface TwoFactorChallenge {
  /** 'code' = enter the authenticator code (or a recovery code); 'enrol' = set it up first (required) */
  two_factor: 'code' | 'enrol';
  challenge_token: string;
  expires_in: number;
  methods: ('authenticator' | 'recovery_code')[];
}

export type SignInAnswer = AuthResponseData | TwoFactorChallenge;

export function isTwoFactorChallenge(d: unknown): d is TwoFactorChallenge {
  const v = (d as { two_factor?: unknown } | null)?.two_factor;
  return v === 'code' || v === 'enrol';
}

export interface Enrolment {
  secret: string;            // the key in groups of four, for typing into the app
  otpauth_uri: string;
  qr_svg_data_url: string;   // drawn on the server — no outside QR service
  issuer: string;
  account: string;
}

export interface TwoFactorStatus {
  applies: boolean;
  policy: 'optional' | 'required';
  required: boolean;
  enrolled: boolean;
  confirmed_at: string | null;
  recovery_codes_left: number;
  recovery_codes_total: number;
  may_disable: boolean;
  session_two_step: boolean;
}

export type SessionWithCodes = AuthResponseData & { recovery_codes: string[] };

/** The second step: an authenticator code (6 digits) or a recovery code (xxxxx-xxxxx). */
export async function verifySecondStep(challengeToken: string, code: string) {
  const { data } = await api.post('/auth/2fa/verify', { challenge_token: challengeToken, code: code.trim() });
  return data.data as AuthResponseData & { second_step: 'authenticator' | 'recovery_code'; recovery_codes_left: number };
}

/** Starts enrolment — signed in (no token) or from a sign-in that requires it (challenge token). */
export async function startEnrolment(challengeToken?: string): Promise<Enrolment> {
  const { data } = await api.post('/auth/2fa/enrol/start', challengeToken ? { challenge_token: challengeToken } : {});
  return data.data;
}

export async function confirmEnrolment(code: string, challengeToken?: string): Promise<SessionWithCodes> {
  const { data } = await api.post('/auth/2fa/enrol/confirm', { code: code.trim(), ...(challengeToken ? { challenge_token: challengeToken } : {}) });
  return data.data;
}

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const { data } = await api.get('/auth/2fa/status');
  return data.data;
}

export async function disableTwoFactor(password: string, code: string): Promise<void> {
  await api.post('/auth/2fa/disable', { password, code: code.trim() });
}

export async function renewRecoveryCodes(password: string, code: string): Promise<string[]> {
  const { data } = await api.post('/auth/2fa/recovery-codes', { password, code: code.trim() });
  return data.data.recovery_codes;
}

// ── Admins ──
export interface TwoFactorPerson {
  user_id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  partner_name: string | null;
  enrolled: boolean;
  enrolled_at: string | null;
  recovery_codes_left: number;
}

export async function fetchTwoFactorOverview(): Promise<{ policy: 'optional' | 'required'; people: TwoFactorPerson[] }> {
  const { data } = await api.get('/admin/two-factor');
  return data.data;
}

export async function resetTwoFactor(userId: string, reason: string): Promise<void> {
  await api.post(`/admin/two-factor/${userId}/reset`, { reason });
}

export const twoFactorKeys = {
  status: ['two-factor', 'status'] as const,
  overview: ['two-factor', 'overview'] as const,
};

/** Staff logins that have the page in the staff area (partners have their own). */
export const TWO_FACTOR_STAFF_ROLES = ['pharmacist_rx', 'pharmacist_pack', 'admin', 'super_admin'] as const;
