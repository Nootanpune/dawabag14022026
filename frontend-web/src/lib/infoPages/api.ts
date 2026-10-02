// Trust pages (Sprint 33): kept on the server, versioned; admins publish new versions.
import api from '../api';

export const INFO_PAGES = [
  { key: 'genuine-medicines', label: 'Genuine medicines' },
  { key: 'expired-damaged-recalled', label: 'Expired, damaged and recalled medicines' },
  { key: 'pharmacist-checked', label: 'How a pharmacist checks your order' },
] as const;
export type InfoPageKey = (typeof INFO_PAGES)[number]['key'];

export const isInfoPageKey = (k: string): k is InfoPageKey => INFO_PAGES.some((p) => p.key === k);
export const infoPageHref = (key: InfoPageKey) => `/trust/${key}`;

/** Placeholders an admin may use; the server fills them from today's settings. */
export const INFO_PAGE_TOKENS: { token: string; meaning: string }[] = [
  { token: '{{sell_min_shelf_days}}', meaning: 'we never supply a batch with this many days or fewer left' },
  { token: '{{receive_min_shelf_days}}', meaning: 'shelf life new stock must have when it arrives' },
  { token: '{{returns_report_hours}}', meaning: 'hours to report damaged, wrong or missing items' },
  { token: '{{returns_expiry_claim_days}}', meaning: 'days to report expired or quality problems' },
  { token: '{{returns_near_expiry_days}}', meaning: 'days left that count as near expiry' },
];

export interface InfoPage {
  page_key: InfoPageKey;
  version: number;
  title: string;
  summary: string;
  body: string;
  published_at: string;
  published_by_name?: string | null;
}

export const infoPageKeys = {
  one: (key: string) => ['info-page', key] as const,
  history: (key: string) => ['info-page', key, 'history'] as const,
};

export async function fetchInfoPage(key: string): Promise<InfoPage> {
  const { data } = await api.get(`/info-pages/${key}`);
  return data.data;
}

export async function fetchInfoPageHistory(key: string): Promise<InfoPage[]> {
  const { data } = await api.get(`/info-pages/${key}/history`);
  return data.data ?? [];
}

export async function publishInfoPage(key: string, body: { title: string; summary: string; body: string }) {
  const { data } = await api.post(`/info-pages/${key}`, body);
  return data.data;
}
