// Personal-data rights — Rulebook C-40..C-44 (DPDP Act 2023). Consent history,
// export and erasure/correction requests are all held on the server.
import api from '../api';
import { downloadFromApi } from '../download';
import { isPolicyLanguage, LANGUAGE_NAMES, type PolicyLanguage } from '../legal/policies';

export interface ConsentRecord {
  purpose: string;
  granted: boolean;
  policy_version: string;
  recorded_at: string;
}

export interface Consents {
  current: ConsentRecord[];
  history: ConsentRecord[];
  /** e.g. 'privacy-v3' — the privacy notice consent is recorded against (C-40) */
  policy_version: string;
  /** language of that notice */
  notice_language?: PolicyLanguage;
}

/** 'privacy-v3' + 'mr' → 'Privacy notice v3, Marathi' */
export function describeNotice(policyVersion: string, language?: string): string {
  const m = /^privacy-v(\d+)$/.exec(policyVersion ?? '');
  const base = m ? `Privacy notice v${m[1]}` : policyVersion === 'unpublished' ? 'Privacy notice not yet published' : `Privacy notice ${policyVersion}`;
  return isPolicyLanguage(language) && policyVersion !== 'unpublished' ? `${base}, ${LANGUAGE_NAMES[language]}` : base;
}

export type DataRequestType = 'erasure' | 'correction';
export type DataRequestStatus = 'pending' | 'completed' | 'rejected';

export interface DataRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  mobile: string | null;
  request_type: DataRequestType;
  details: string | null;
  status: DataRequestStatus;
  outcome: string | null;
  created_at: string;
  handled_at: string | null;
}

export const privacyKeys = {
  consents: ['privacy', 'consents'] as const,
  requests: (status: string) => ['privacy', 'requests', status] as const,
  myRequests: ['privacy', 'my-requests'] as const,
};

export const PURPOSE_LABELS: Record<string, string> = {
  marketing: 'Offers and health tips (marketing)',
  privacy_notice: 'Privacy notice accepted',
  age_18_plus: 'Confirmed 18 years or older',
};

export async function fetchConsents(): Promise<Consents> {
  const { data } = await api.get('/privacy/consents');
  return data.data;
}

export async function setMarketingConsent(granted: boolean): Promise<Consents> {
  const { data } = await api.put('/privacy/consents/marketing', { granted });
  return data.data;
}

/** Downloads everything held about the signed-in user as JSON (C-42). */
export function downloadMyData() {
  return downloadFromApi('/privacy/export', 'dawabag-my-data.json');
}

export async function createDataRequest(request_type: DataRequestType, details?: string) {
  const { data } = await api.post('/privacy/requests', { request_type, ...(details ? { details } : {}) });
  return data.data as { id: string; request_type: DataRequestType; status: DataRequestStatus; created_at: string };
}

export type MyDataRequest = Omit<DataRequest, 'user_id' | 'user_name' | 'mobile'>;

/** The signed-in user's own correction / erasure requests and their outcome (C-43, C-44). */
export async function fetchMyDataRequests(): Promise<MyDataRequest[]> {
  const { data } = await api.get('/privacy/requests');
  return data.data?.requests ?? [];
}

// ── Admin ──
export async function fetchDataRequests(status: string): Promise<DataRequest[]> {
  const { data } = await api.get('/privacy/admin/requests', { params: status ? { status } : {} });
  return data.data?.requests ?? [];
}

export async function handleDataRequest(id: string, action: 'complete' | 'reject', outcome: string) {
  const { data } = await api.patch(`/privacy/admin/requests/${id}`, { action, outcome });
  return data.data;
}
