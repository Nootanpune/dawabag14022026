// Published policies (Rulebook C-39): terms, privacy, shipping, cancellation,
// refund. Versioned on the server; a new version never overwrites an old one.
import api from '../api';

export const POLICY_KEYS = ['terms', 'privacy', 'shipping', 'cancellation', 'refund'] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

export const POLICY_LABELS: Record<PolicyKey, string> = {
  terms: 'Terms of use',
  privacy: 'Privacy policy',
  shipping: 'Shipping policy',
  cancellation: 'Cancellation policy',
  refund: 'Returns & refund policy',
};

export function isPolicyKey(k: string): k is PolicyKey {
  return (POLICY_KEYS as readonly string[]).includes(k);
}

export interface PolicySummary {
  doc_key: PolicyKey;
  version: number;
  title: string;
  effective_from: string;
  lawyer_reviewed: boolean;
  published_at: string;
}

export interface PolicyDoc extends PolicySummary {
  /** plain text / markdown — rendered as text, never as HTML */
  body: string;
}

export type PolicyVersion = Omit<PolicySummary, 'doc_key'>;

export interface NewPolicyVersion {
  doc_key: PolicyKey;
  title: string;
  body: string;
  effective_from: string;
  lawyer_reviewed: boolean;
}

export const policyKeys = {
  list: ['policies'] as const,
  one: (key: string, version?: number) => ['policies', key, version ?? 'current'] as const,
  history: (key: string) => ['policies', key, 'history'] as const,
};

export async function fetchPolicies(): Promise<PolicySummary[]> {
  const { data } = await api.get('/legal/policies');
  return data.data?.policies ?? [];
}

/** Current version (404 until one is published and in effect), or a specific version. */
export async function fetchPolicy(key: PolicyKey, version?: number): Promise<PolicyDoc> {
  const { data } = await api.get(`/legal/policies/${key}`, { params: version ? { version } : {} });
  return data.data;
}

export async function fetchPolicyHistory(key: PolicyKey): Promise<PolicyVersion[]> {
  const { data } = await api.get(`/legal/policies/${key}/history`);
  return data.data?.versions ?? [];
}

export async function publishPolicy(body: NewPolicyVersion) {
  const { data } = await api.post('/legal/policies', body);
  return data.data as { doc_key: PolicyKey; version: number; effective_from: string };
}
