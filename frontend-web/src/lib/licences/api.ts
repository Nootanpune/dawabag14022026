// Drug licence API calls (Sprint 30). Holders: /partner/licences (partner portal) and
// /users/me/licences (retailer, wholesaler, doctor/hospital). Admins: /admin/party-licences.
// Scans go straight to the server's private store; links are short-lived and logged (C-41).
import api from '../api';
import type { LicenceBadgeData, LicenceBody, LicenceView } from './forms';

export type Holder = 'partner' | 'buyer';
const base = (h: Holder) => (h === 'partner' ? '/partner/licences' : '/users/me/licences');

export interface HolderLicences extends LicenceBadgeData {
  licences: LicenceView[];
  replaced: LicenceView[];
  licence_line: string | null;
  can_trade: boolean;
  problems: string[];
  warnings: string[];
}

export const licenceKeys = {
  holder: (h: Holder) => ['licences', h] as const,
  admin: (filter: string) => ['admin', 'party-licences', filter] as const,
};

export async function fetchHolderLicences(h: Holder): Promise<HolderLicences> {
  const { data } = await api.get(base(h));
  return data.data;
}

export async function submitLicences(h: Holder, licences: LicenceBody[]): Promise<{ licence_ids: string[]; message: string }> {
  const { data } = await api.post(base(h), { licences });
  return data.data;
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 };

export async function uploadLicenceDocument(where: Holder | 'admin', licenceId: string, file: File) {
  const f = new FormData();
  f.append('file', file);
  const url = where === 'admin' ? `/admin/party-licences/${licenceId}/document` : `${base(where)}/${licenceId}/document`;
  const { data } = await api.post(url, f, multipart);
  return data.data as { licence_id: string; has_document: boolean };
}

export async function licenceDocumentUrl(where: Holder | 'admin', licenceId: string): Promise<string> {
  const url = where === 'admin' ? `/admin/party-licences/${licenceId}/document-url` : `${base(where)}/${licenceId}/document-url`;
  const { data } = await api.get(url);
  return data.data.url;
}

export interface AdminLicenceRow extends LicenceView {
  party_type: 'vendor' | 'customer';
  vendor_id: string | null;
  user_id: string | null;
  party_name: string | null;
  party_kind: string | null;
  created_at: string;
}

export async function fetchPartyLicences(filter: 'waiting' | 'expiring' | 'expired' | 'all'): Promise<AdminLicenceRow[]> {
  const { data } = await api.get('/admin/party-licences', { params: { filter } });
  return data.data?.licences ?? [];
}

export interface LicenceDecision { verified: boolean; valid_upto?: string | null; issued_by?: string | null; reason?: string | null }
export async function decideLicence(licenceId: string, d: LicenceDecision) {
  const { data } = await api.post(`/admin/party-licences/${licenceId}/decision`, d);
  return data.data as { licence_id: string; status: string; account_activated: boolean };
}

/** Admin KYC review: the buyer's checked licences, as the admin enters / corrects them. */
export async function saveBuyerLicences(userId: string, licences: LicenceBody[]) {
  const { data } = await api.put(`/kyc/admin/applications/${userId}/licences`, { licences });
  return data.data as { account_activated: boolean };
}
