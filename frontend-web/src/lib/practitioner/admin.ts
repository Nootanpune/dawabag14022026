// Staff side of sales to doctors / institutions (Sprint 44): registrations to verify and the
// "Sales to doctors and medical institutions" register (admin: every seller; partner: its own).
import api from '../api';
import { downloadFromApi } from '../download';

export interface PractitionerRow {
  user_id: string;
  name: string | null;
  business_name: string | null;
  kind: 'doctor' | 'institution';
  kyc_status: string | null;
  registration_number: string | null;
  council: string | null;
  name_as_per_register: string | null;
  status: string;
  valid_till: string | null;
  note: string | null;
  certificate_document_id: string | null;
  certificate_uploaded_at: string | null;
  can_order: boolean;
  message: string;
}

export interface RegistrationDecision {
  decision: 'verify' | 'reject' | 'suspend';
  registration_number: string;
  council: string;
  valid_till?: string | null;
  name_as_per_register?: string | null;
  kind?: 'doctor' | 'institution';
  reason?: string | null;
}

export async function fetchPractitioners(filter: 'attention' | 'all'): Promise<PractitionerRow[]> {
  const { data } = await api.get(`/practitioner-sales/practitioners?filter=${filter}`);
  return data.data?.practitioners ?? [];
}

export async function decideRegistration(userId: string, d: RegistrationDecision) {
  const { data } = await api.post(`/practitioner-sales/practitioners/${userId}/registration`, d);
  return data.data;
}

/** The checked certificate copy (KYC document) — a 5-minute link, every view logged (C-41). */
export async function kycDocumentLink(documentId: string): Promise<string> {
  const { data } = await api.get(`/kyc/admin/documents/${documentId}/url`);
  return data.data?.url;
}

export interface RegisterRow {
  invoice_date: string;
  invoice_number: string;
  seller: string;
  seller_licences: string | null;
  order_number: string;
  buyer_name: string | null;
  buyer_kind: string;
  institution: string | null;
  registration_number: string | null;
  council: string | null;
  registration_valid_till: string | null;
  certificate_on_file: boolean;
  written_order: string | null;
  written_order_ids: string[];
  written_order_signed_at: string | null;
  product_name: string;
  batch_number: string | null;
  expiry: string | null;
  quantity: number;
  line_total_paise: number;
  pharmacist_name: string | null;
  pharmacist_reg_no: string | null;
  shipment_status: string;
}

const base = (scope: 'admin' | 'partner') => (scope === 'admin' ? '/practitioner-sales/register' : '/partner/practitioner-sales');

export async function fetchRegister(scope: 'admin' | 'partner', from: string, to: string): Promise<RegisterRow[]> {
  const { data } = await api.get(`${base(scope)}?from=${from}&to=${to}`);
  return data.data?.rows ?? [];
}

/** The CSV through the signed-in client (lib/download.ts) — nothing kept by the page. */
export async function downloadRegisterCsv(scope: 'admin' | 'partner', from: string, to: string): Promise<void> {
  await downloadFromApi(base(scope), `sales-to-doctors-${from}-to-${to}.csv`, { from, to, format: 'csv' });
}
