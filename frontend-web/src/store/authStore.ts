// Auth state held in memory only (no persist). The session is restored on each
// page load from the server via POST /auth/refresh (httpOnly cookie) — see SessionBootstrap.
import { create } from 'zustand';
import api from '../lib/api';
import {
  notifySessionExpired,
  onPasswordChangeRequired,
  onSessionExpired,
  refreshSession,
  setAccessToken,
  type AuthResponseData,
} from '../lib/session';

export interface User {
  id: string;
  mobile: string;
  email?: string;
  role: string;
  full_name?: string;
  wallet_balance_paise?: number;
  referral_code?: string;
  business_name?: string;
  /** customer | b2b_retailer | b2b_wholesaler | doc_hospital */
  customer_type?: string;
  /** not_required | pending_otp | pending_kyc | approved | rejected | ... */
  kyc_status?: string;
  /** true until a temporary password set by Dawabag's admin is replaced (Sprint 28) */
  must_change_password?: boolean;
}

/** 'unknown' until the startup refresh has answered */
export type SessionStatus = 'unknown' | 'signed_in' | 'signed_out';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: SessionStatus;
  /** Restore the session from the refresh cookie (called once on app load). */
  bootstrap: () => Promise<void>;
  login: (data: AuthResponseData) => void;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: User) => void;
  setKycStatus: (kycStatus: string) => void;
}

function userFromSession(d: AuthResponseData): User {
  return {
    id: d.user_id,
    role: d.role,
    full_name: d.full_name,
    mobile: d.mobile ?? '',
    customer_type: d.customer_type,
    kyc_status: d.kyc_status,
    must_change_password: !!d.must_change_password,
  };
}

const SIGNED_OUT = { user: null, isAuthenticated: false, status: 'signed_out' as const };

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  status: 'unknown',

  bootstrap: async () => {
    const session = await refreshSession();
    if (session) get().login(session);
    else set(SIGNED_OUT);
  },

  login: (data) => {
    setAccessToken(data.access_token);
    set({ user: userFromSession(data), isAuthenticated: true, status: 'signed_in' });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    setAccessToken(null);
    set(SIGNED_OUT);
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/users/me');
      set({ user: data.data, isAuthenticated: true, status: 'signed_in' });
    } catch (_) {
      notifySessionExpired();
    } finally {
      set({ isLoading: false });
    }
  },

  setUser: (user) => set({ user }),

  setKycStatus: (kyc_status) => {
    const user = get().user;
    if (user) set({ user: { ...user, kyc_status } });
  },
}));

// A failed refresh anywhere in the app signs the user out of the in-memory store.
onSessionExpired(() => useAuthStore.setState(SIGNED_OUT));

// The server says this login still has its temporary password: show the change form.
onPasswordChangeRequired(() => {
  const user = useAuthStore.getState().user;
  if (user && !user.must_change_password) useAuthStore.setState({ user: { ...user, must_change_password: true } });
});
