// Web session handling — server is the single source of truth (docs/DECISIONS.md).
// The refresh token lives only in the server-set httpOnly cookie `dwb_rt`; the
// access token lives only in this module's memory. Nothing is written to any
// browser storage.
import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const API_BASE = `${API_URL}/api/v1`;

/** Sent on every request so the server uses the cookie-based web session. */
export const CLIENT_HEADERS = { 'X-Client': 'web' } as const;

/** data returned by POST /auth/login, /auth/verify-otp and /auth/refresh (web: no refresh_token) */
export interface AuthResponseData {
  user_id: string;
  role: string;
  customer_type?: string;
  kyc_status?: string;
  full_name?: string;
  mobile?: string;
  access_token: string;
  /** only present for mobile clients; never stored by the web app */
  refresh_token?: string;
  expires_in?: number;
}

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// ─── Refresh (single-flight) ─────────────────────────────────────────────────
let inflight: Promise<AuthResponseData | null> | null = null;

/**
 * POST /auth/refresh using the httpOnly cookie. Resolves to the new session, or
 * null when signed out. Concurrent callers share one request.
 */
export function refreshSession(): Promise<AuthResponseData | null> {
  if (!inflight) {
    inflight = axios
      .post(`${API_BASE}/auth/refresh`, {}, { headers: CLIENT_HEADERS, withCredentials: true, timeout: 15000 })
      .then(({ data }) => {
        const session = data?.data as AuthResponseData | undefined;
        setAccessToken(session?.access_token ?? null);
        return session?.access_token ? session : null;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// ─── Session-expired notification (lets the auth store react without a circular import) ──
type Listener = () => void;
const expiredListeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

export function notifySessionExpired(): void {
  setAccessToken(null);
  expiredListeners.forEach((l) => l());
}
