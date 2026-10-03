// Sprint 36 — API keys for a partner's stock feed (the billing software uploads its
// stock file by itself). Issued, listed and revoked by an admin (any partner) or the
// partner's owner login (its own). The key is shown ONCE, in the issue response; it is
// never kept in the browser (standing rule) and never sent back by the server again.
import api from './api';

export interface PartnerApiKey {
  id: string;
  partner_id: string;
  prefix: string;
  masked: string;
  label: string;
  scope: 'stock_upload';
  active: boolean;
  created_at: string;
  created_by_name: string | null;
  last_used_at: string | null;
  use_count: number;
  revoked_at: string | null;
  revoked_by_name: string | null;
  revoke_reason: string | null;
}

export interface IssuedKey { key: PartnerApiKey; secret: string; note: string }

/** Where a partner's keys live: an admin works on any partner, an owner on its own. */
export type KeyOwner = { kind: 'admin'; vendorId: string } | { kind: 'partner' };

const base = (o: KeyOwner) => (o.kind === 'admin' ? `/admin/partners/${o.vendorId}/api-keys` : '/partner/api-keys');

export const apiKeyKeys = {
  list: (o: KeyOwner) => ['partner-api-keys', o.kind === 'admin' ? o.vendorId : 'mine'] as const,
};

export async function fetchApiKeys(o: KeyOwner): Promise<PartnerApiKey[]> {
  const { data } = await api.get(base(o));
  return data.data.keys;
}

export async function issueApiKey(o: KeyOwner, label: string): Promise<IssuedKey> {
  const { data } = await api.post(base(o), { label: label.trim() });
  return data.data;
}

export async function revokeApiKey(o: KeyOwner, keyId: string, reason: string) {
  const { data } = await api.post(`${base(o)}/${keyId}/revoke`, reason.trim() ? { reason: reason.trim() } : {});
  return data.data as { key: PartnerApiKey };
}

/** The address a partner's software calls (shown next to the key). */
export const feedUrl = (apiBase: string, partnerId: string) => `${apiBase.replace(/\/$/, '')}/partner-feed/${partnerId}/stock-files`;
