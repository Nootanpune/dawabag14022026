import api from '../api';
import type { LicenceBadgeData, LicenceView } from '../licences/forms';

export type KycQueueType = '' | 'b2b_retailer' | 'b2b_wholesaler' | 'doc_hospital';

export interface KycQueueRow extends Partial<LicenceBadgeData> {
  licences?: LicenceView[];
  user_id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  customer_type: string;
  business_name: string | null;
  kyc_status: string;
  kyc_submitted_at: string | null;
  drug_license_number: string | null;
  drug_license_type: string | null;
  drug_license_expiry: string | null;
  gstin: string | null;
  gstin_verified: boolean;
  pan_number: string | null;
  pan_verified: boolean;
  nmc_reg_number: string | null;
  nmc_reg_verified: boolean;
  nmc_council_state: string | null;
  pending_checks: string | number;
  dl_portal_url: string | null;
  nmc_portal_url: string | null;
  registered_at: string;
}

export interface KycApplicant {
  id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  customer_type: string;
  kyc_status: string;
  kyc_submitted_at: string | null;
  kyc_approved_at: string | null;
  kyc_rejection_reason: string | null;
  business_name: string | null;
  registration_pincode: string | null;
  pan_number: string | null;
  pan_verified: boolean;
  gstin: string | null;
  gstin_verified: boolean;
  gst_unregistered_declaration: boolean | null;
  drug_license_type: string | null;
  drug_license_number: string | null;
  drug_license_expiry: string | null;
  drug_license_verified: boolean;
  nmc_reg_number: string | null;
  nmc_council_state: string | null;
  nmc_reg_verified: boolean;
  doctor_speciality: string | null;
  credit_limit_paise: number;
  credit_used_paise: number;
  created_at: string;
}

export interface KycCheck {
  check: string;
  result: string;
  method: string | null;
  verified_at: string | null;
  /** drug licence checks (Sprint 30): the licence in the register and its label */
  licence_id?: string | null;
  label?: string;
}

export interface KycDocument {
  id: string;
  document_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface KycHistoryEntry {
  action: string;
  notes: string | null;
  created_at: string;
  performed_by_name: string | null;
}

export interface KycApplication {
  user: KycApplicant;
  /** every drug licence the buyer gave (checked, waiting, not accepted); replaced ones apart */
  licences: LicenceView[];
  replaced_licences: LicenceView[];
  checks: KycCheck[];
  missing_documents: string[];
  licence_expired: boolean;
  documents: KycDocument[];
  history: KycHistoryEntry[];
  portal_links: Partial<Record<'drug_license' | 'nmc' | 'gstin' | 'pan', string>>;
}

export interface KycDecisionResult {
  verified: boolean;
  account_activated: boolean;
}

export const kycKeys = {
  queue: (type: KycQueueType) => ['admin', 'kyc', 'queue', type] as const,
  application: (userId: string) => ['admin', 'kyc', 'application', userId] as const,
};

export async function fetchKycQueue(type: KycQueueType): Promise<KycQueueRow[]> {
  const { data } = await api.get('/kyc/admin/queue', { params: type ? { customer_type: type } : undefined });
  return data.data ?? [];
}

export async function fetchKycApplication(userId: string): Promise<KycApplication> {
  const { data } = await api.get(`/kyc/admin/applications/${userId}`);
  return data.data;
}

/** Short-lived signed URL; the caller opens it at once and never keeps it. */
export async function fetchDocumentUrl(documentId: string): Promise<string> {
  const { data } = await api.get(`/kyc/admin/documents/${documentId}/url`);
  return data.data.url;
}

export interface IdentityDecision {
  user_id: string;
  document_type: 'pan' | 'gstin';
  verified: boolean;
  rejection_reason?: string;
  notes?: string;
}

export interface DrugLicenseDecision {
  user_id: string;
  dl_number: string;
  dl_type: 'DL-20' | 'DL-21' | 'DL-20B' | 'DL-21B';
  verified: boolean;
  license_holder_name?: string;
  valid_upto?: string;
  premises_address?: string;
  rejection_reason?: string;
  notes?: string;
}

export interface NmcDecision {
  user_id: string;
  nmc_number: string;
  council_state: string;
  verified: boolean;
  doctor_name_as_per_register?: string;
  qualification?: string;
  /** Sprint 44: needed to verify — until when the registration is valid (FDA Pune circular 16/2026) */
  valid_till?: string;
  practitioner_kind?: 'doctor' | 'institution';
  rejection_reason?: string;
  notes?: string;
}

export async function verifyIdentity(body: IdentityDecision): Promise<KycDecisionResult> {
  const { data } = await api.post('/kyc/admin/verify-identity', body);
  return data.data;
}

export async function verifyDrugLicense(body: DrugLicenseDecision): Promise<KycDecisionResult> {
  const { data } = await api.post('/kyc/admin/verify-drug-license', body);
  return data.data;
}

export async function verifyNmc(body: NmcDecision): Promise<KycDecisionResult> {
  const { data } = await api.post('/kyc/admin/verify-nmc', body);
  return data.data;
}

export async function rejectApplication(userId: string, reason: string): Promise<{ kyc_status: string }> {
  const { data } = await api.post('/kyc/admin/reject', { user_id: userId, reason });
  return data.data;
}

/** 'dl20b' → 'DL-20B' (the verify-drug-license API format) */
export function toApiDlType(t: string | null | undefined): DrugLicenseDecision['dl_type'] | null {
  const map: Record<string, DrugLicenseDecision['dl_type']> = {
    dl20: 'DL-20',
    dl21: 'DL-21',
    dl20b: 'DL-20B',
    dl21b: 'DL-21B',
  };
  return t ? map[t] ?? null : null;
}
