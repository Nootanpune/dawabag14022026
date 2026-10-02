// Sign-in by OTP and "Forgot password" (Sprint 35). The server answers /send-otp the
// same way whether or not the mobile has an account; the code itself proves the person
// holds the mobile. Nothing is kept in the browser (the session is an httpOnly cookie).
import api from '../api';
import type { AuthResponseData } from '../session';

export async function sendOtp(mobile: string): Promise<void> {
  await api.post('/auth/send-otp', { mobile });
}

export async function signInWithOtp(mobile: string, otp: string): Promise<AuthResponseData> {
  const { data } = await api.post('/auth/verify-otp', { mobile, otp });
  return data.data;
}

export async function resetPassword(mobile: string, otp: string, newPassword: string): Promise<AuthResponseData> {
  const { data } = await api.post('/auth/reset-password', { mobile, otp, new_password: newPassword });
  return data.data;
}

/** Where each kind of login lands after signing in. */
export function homeForRole(role: string | undefined, staffHome: (r: string) => string, next: string | null): string {
  if (role === 'admin' || role === 'super_admin') return '/admin';
  if (role === 'doctor') return '/doctor';
  if (role && ['pharmacist_rx', 'pharmacist_pack', 'delivery'].includes(role)) return staffHome(role);
  if (role === 'partner') return '/partner';
  return next ?? '/';
}
