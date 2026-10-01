import api from './api';

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

