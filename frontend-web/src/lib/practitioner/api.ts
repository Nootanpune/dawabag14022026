// Sales to doctors and medical institutions (Sprint 44; Drugs Rules 1945 r.64(2), r.65(9)(b);
// FDA Maharashtra (Pune Division) circular No. Drug/Wholesalers Memo./16/2026/1, 30-09-2026).
// Every status, link and amount is the server's; nothing is kept in the browser.
import api from '../api';

export interface MyRegistration {
  applies: boolean;
  kind?: 'doctor' | 'institution';
  registration_number?: string | null;
  council?: string | null;
  name_as_per_register?: string | null;
  status?: 'pending' | 'verified' | 'rejected' | 'suspended';
  valid_till?: string | null;
  certificate_uploaded?: boolean;
  institution?: { name: string | null; licences: { label: string; number: string; valid_upto: string | null; status: string }[] } | null;
  can_order?: boolean;
  message?: string;
  written_order_required?: boolean;
}

export interface WrittenOrderItem { product_id: string; product_name: string; quantity: number }

export interface WrittenOrderSummary {
  id: string;
  kind: 'upload' | 'in_app';
  signed_at: string;
  items?: WrittenOrderItem[] | null;
  document_name?: string | null;
}

export const practitionerKeys = {
  me: ['practitioner', 'me'] as const,
  writtenOrders: ['practitioner', 'written-orders'] as const,
  list: (filter: string) => ['admin', 'practitioners', filter] as const,
  register: (scope: 'admin' | 'partner', from: string, to: string) => ['practitioner-register', scope, from, to] as const,
};

export async function fetchMyRegistration(): Promise<MyRegistration> {
  const { data } = await api.get('/practitioner-sales/me');
  return data.data;
}

export async function fetchMyWrittenOrders(): Promise<WrittenOrderSummary[]> {
  const { data } = await api.get('/written-orders/mine');
  return data.data?.written_orders ?? [];
}

/** (a) the doctor's signed requisition (PDF, JPEG or PNG, up to 5 MB) — straight to the server's object store */
export async function uploadWrittenOrder(file: File): Promise<{ id: string; kind: 'upload'; signed_at: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/written-orders/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data.data;
}

export async function previewRequisition(items: { product_id: string; quantity: number }[]): Promise<{ text: string; name_as_per_register: string; signature: string }> {
  const { data } = await api.post('/written-orders/requisition/preview', { items });
  return data.data;
}

/** (b) signed in the app: name as on the register, the declaration, and the password re-entered now */
export async function signRequisition(body: { items: { product_id: string; quantity: number }[]; typed_name: string; password: string; declaration: boolean }) {
  const { data } = await api.post('/written-orders/requisition', body);
  return data.data as { id: string; kind: 'in_app'; signed_at: string; content_sha256: string };
}

/** A 5-minute link to open a written order (uploaded file, or the signed requisition as a PDF). */
export async function writtenOrderLink(id: string): Promise<string> {
  const { data } = await api.get(`/written-orders/${id}/link`);
  return data.data.url;
}

export async function certificateLink(writtenOrderId: string): Promise<string> {
  const { data } = await api.get(`/written-orders/${writtenOrderId}/certificate`);
  return data.data.url;
}

export const WRITTEN_ORDER_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const WRITTEN_ORDER_MAX_BYTES = 5 * 1024 * 1024;
export function writtenOrderFileProblem(file: File): string | null {
  if (!WRITTEN_ORDER_TYPES.includes(file.type)) return 'Choose a PDF, or a photo (JPEG or PNG), of the signed requisition.';
  if (file.size > WRITTEN_ORDER_MAX_BYTES) return 'This file is larger than 5 MB.';
  if (file.size === 0) return 'This file is empty. Please choose it again.';
  return null;
}

export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting for our check', verified: 'Verified', rejected: 'Not verified', suspended: 'Suspended',
};
