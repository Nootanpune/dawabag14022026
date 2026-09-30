import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

interface User {
  id: string;
  mobile: string;
  email?: string;
  role: string;
  full_name?: string;
  wallet_balance_paise?: number;
  referral_code?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: { user_id: string; role: string; full_name?: string; access_token: string; refresh_token: string }) => void;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: ({ user_id, role, full_name, access_token, refresh_token }) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);
        }
        set({
          user: { id: user_id, role, full_name, mobile: '' },
          isAuthenticated: true,
        });
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch (_) {}
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, isAuthenticated: false });
      },

      fetchMe: async () => {
        set({ isLoading: true });
        try {
          const { data } = await api.get('/users/me');
          set({ user: data.data, isAuthenticated: true });
        } catch (_) {
          set({ user: null, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'dawabag-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
