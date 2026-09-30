import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ─── Request interceptor: attach JWT ─────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: refresh token on 401 ──────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.clear();
        window.location.href = '/auth/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefresh } = data.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', newRefresh);

        processQueue(null, access_token);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = '/auth/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Shared auth types ───────────────────────────────────────────────────────
/** data returned by POST /auth/login and POST /auth/verify-otp */
export interface AuthResponseData {
  user_id: string;
  role: string;
  customer_type?: string;
  kyc_status?: string;
  full_name?: string;
  mobile?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

// ─── Error helper ────────────────────────────────────────────────────────────
/**
 * Extracts a human-readable message from an API error.
 * Handles `{ message }`, legacy `{ error }` and validation `{ errors: [{ path, message }] }` bodies.
 */
export function getApiErrorMessage(err: any, fallback = 'Something went wrong'): string {
  const body = err?.response?.data;
  if (body) {
    if (typeof body.message === 'string' && body.message) return body.message;
    if (typeof body.error === 'string' && body.error) return body.error;
    if (Array.isArray(body.errors) && body.errors.length) {
      return body.errors.map((e: any) => e?.message).filter(Boolean).join('. ') || fallback;
    }
  }
  if (err?.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
  if (err?.request && !err?.response) return 'Network error. Check your connection and try again.';
  return fallback;
}

/** Field-level validation errors from a 422 `{ success:false, message, error, errors: [{ path, message }] }`, keyed by field name. */
export function getApiFieldErrors(err: any): Record<string, string> {
  const out: Record<string, string> = {};
  const errors = err?.response?.data?.errors;
  if (!Array.isArray(errors)) return out;
  for (const e of errors) {
    // path is normally the field name ("pan_number"); tolerate arrays / dotted paths too.
    const raw = Array.isArray(e?.path) ? e.path[e.path.length - 1] : e?.path;
    const field = raw == null ? '' : String(raw).split('.').pop() ?? '';
    if (field && e?.message && !out[field]) out[field] = String(e.message);
  }
  return out;
}

// ─── KYC document upload ─────────────────────────────────────────────────────
/** POST /kyc/documents (multipart). `onProgress` receives 0–100. */
export async function uploadKycDocument(
  documentType: string,
  file: File,
  accessToken: string,
  onProgress?: (percent: number) => void
) {
  const form = new FormData();
  form.append('document_type', documentType);
  form.append('file', file);
  const { data } = await api.post('/kyc/documents', form, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/form-data',
    },
    timeout: 120000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}

export default api;
