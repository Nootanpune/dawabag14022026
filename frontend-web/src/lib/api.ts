import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  API_BASE,
  CLIENT_HEADERS,
  getAccessToken,
  notifySessionExpired,
  refreshSession,
} from './session';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json', ...CLIENT_HEADERS },
  withCredentials: true,
  timeout: 15000,
});

// ─── Request interceptor: attach the in-memory access token ──────────────────
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor: on 401 refresh once, then retry ───────────────────
type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      const session = await refreshSession();
      if (session) {
        original.headers.Authorization = `Bearer ${session.access_token}`;
        return api(original);
      }
      notifySessionExpired();
    }
    return Promise.reject(error);
  }
);

// Re-exports so existing imports from '@/lib/api' keep working.
export type { AuthResponseData } from './session';
export { getApiErrorMessage, getApiFieldErrors } from './apiErrors';
export { uploadKycDocument } from './kyc';

export default api;
