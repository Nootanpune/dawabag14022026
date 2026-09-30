// Helpers for turning API error responses into UI text.

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

