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

/** Languages a policy can be read in (DPDP notice in English or an Eighth Schedule language; C-40). */
export const POLICY_LANGUAGES = ['en', 'mr', 'hi'] as const;
export type PolicyLanguage = (typeof POLICY_LANGUAGES)[number];
export type TranslationLanguage = Exclude<PolicyLanguage, 'en'>;

/** Names shown in the switcher, each in its own script */
export const LANGUAGE_LABELS: Record<PolicyLanguage, string> = { en: 'English', mr: 'मराठी', hi: 'हिंदी' };
/** Names in English, for staff screens and notes */
export const LANGUAGE_NAMES: Record<PolicyLanguage, string> = { en: 'English', mr: 'Marathi', hi: 'Hindi' };

export function isPolicyLanguage(l: unknown): l is PolicyLanguage {
  return typeof l === 'string' && (POLICY_LANGUAGES as readonly string[]).includes(l);
}

export interface PolicySummary {
  doc_key: PolicyKey;
  version: number;
  title: string;
  effective_from: string;
  lawyer_reviewed: boolean;
  published_at: string;
  /** languages published for this version, e.g. ['en', 'mr'] */
  languages?: PolicyLanguage[];
}

export interface PolicyDoc extends Omit<PolicySummary, 'languages'> {
  /** plain text / markdown — rendered as text, never as HTML */
  body: string;
  /** language of the text returned (English when the translation is missing) */
  language?: PolicyLanguage;
  requested_language?: PolicyLanguage;
  translation_available?: boolean;
}

/** One history row: a version in one language (C-40) */
export type PolicyVersion = Omit<PolicySummary, 'doc_key' | 'languages'> & { language?: PolicyLanguage };

export interface NewPolicyTranslation {
  /** the English version this text translates */
  version: number;
  language: TranslationLanguage;
  title: string;
  body: string;
  lawyer_reviewed: boolean;
}

export interface NewPolicyVersion {
  doc_key: PolicyKey;
  title: string;
  body: string;
  effective_from: string;
  lawyer_reviewed: boolean;
}

export const policyKeys = {
  list: ['policies'] as const,
  one: (key: string, version?: number, lang: PolicyLanguage = 'en') =>
    ['policies', key, version ?? 'current', lang] as const,
  history: (key: string) => ['policies', key, 'history'] as const,
};

export async function fetchPolicies(): Promise<PolicySummary[]> {
  const { data } = await api.get('/legal/policies');
  return data.data?.policies ?? [];
}

/**
 * Current version (404 until one is published and in effect), or a specific version,
 * in the requested language; the server falls back to English (translation_available=false).
 */
export async function fetchPolicy(key: PolicyKey, version?: number, lang: PolicyLanguage = 'en'): Promise<PolicyDoc> {
  const params: Record<string, string | number> = {};
  if (version) params.version = version;
  if (lang !== 'en') params.lang = lang;
  const { data } = await api.get(`/legal/policies/${key}`, { params });
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

/** Marathi / Hindi text of an existing English version (C-40). 404 no such version; 409 already published. */
export async function publishPolicyTranslation(key: PolicyKey, body: NewPolicyTranslation) {
  const { data } = await api.post(`/legal/policies/${key}/translations`, body);
  return data.data as { doc_key: PolicyKey; version: number; language: TranslationLanguage };
}
