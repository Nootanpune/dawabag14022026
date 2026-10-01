// POST /products/images/bulk — the photos go to the API and from there only to
// the server object store. Each one waits for pharmacist approval (C-19).
import api from '../../api';

export type BulkPhotoStatus = 'uploaded' | 'skipped' | 'failed';

export interface BulkPhotoResult {
  file: string;
  sku: string | null;
  product_id?: string;
  status: BulkPhotoStatus;
  message: string;
}

export interface BulkPhotoResponse {
  summary: { total: number; uploaded: number; skipped: number; failed: number };
  results: BulkPhotoResult[];
}

export async function uploadPhotoBatch(files: File[]): Promise<BulkPhotoResponse> {
  const form = new FormData();
  for (const f of files) form.append('images', f, f.name);
  const { data } = await api.post('/products/images/bulk', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
  return data.data;
}
