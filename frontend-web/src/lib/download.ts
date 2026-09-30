// File downloads from the API (invoices, H1 register CSV, personal-data export).
// The API authenticates GET requests with the in-memory Bearer token only (the
// httpOnly cookie is just the refresh token), so a plain <a href> cannot carry
// auth. We fetch through the authenticated client and hand the bytes straight
// to the browser's save dialog; nothing is kept by the app (server is the
// single source of truth, docs/DECISIONS.md).
import api from './api';

function filenameFrom(disposition: string | undefined, fallback: string): string {
  const m = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return m ? decodeURIComponent(m[1]) : fallback;
}

/** GET `path` (relative to /api/v1) and save the response as a file. */
export async function downloadFromApi(path: string, fallbackName: string, params?: Record<string, string>): Promise<void> {
  const res = await api.get(path, { params, responseType: 'blob', timeout: 60000 });
  const url = URL.createObjectURL(res.data as Blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameFrom(res.headers['content-disposition'], fallbackName);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Release the in-memory copy once the browser has taken it.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

/** Error bodies of blob requests arrive as Blobs; turn them back into JSON for getApiErrorMessage. */
export async function normaliseBlobError(err: any): Promise<any> {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      err.response.data = JSON.parse(await data.text());
    } catch {
      /* not JSON — leave as is */
    }
  }
  return err;
}
