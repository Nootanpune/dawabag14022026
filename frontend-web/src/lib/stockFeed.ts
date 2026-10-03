// Sprint 37 — the live stock feed from a partner's billing software (MediVision via a
// connector on the partner's LAN). Everything here is read from the API on every
// view and poll; nothing is kept in the browser (standing rule: the server is the
// single source of truth).
import api from './api';

export type FeedMode = 'manual' | 'live';
export type StalePolicy = 'hide' | 'margin';
export type CheckKind = 'new_product' | 'new_listing' | 'cold_chain_batch' | 'price_change' | 'expiry_change' | 'short_for_orders';

export interface FeedStatus {
  partner_id: string;
  mode: FeedMode;
  stale_after_minutes: number;
  stale_policy: StalePolicy;
  stale_margin_pct: number;
  billing_grace_minutes: number;
  last_sequence: number | null;
  last_taken_at: string | null;
  last_received_at: string | null;
  stale: boolean;
  stale_since: string | null;
  last_result: { applied?: { packs_offered: number; batches_set: number; batches_new: number; batches_zeroed: number; held_for_orders: number } } | null;
  waiting_checks: number;
  waiting_by_kind: Partial<Record<CheckKind, number>>;
  held_for_orders: number;
}

export interface FeedAlerts { mode: FeedMode; waiting_checks: number; stale: boolean; last_taken_at: string | null }

export interface AdminFeedAlerts {
  waiting_checks: number;
  stale_feeds: number;
  partners: { partner_id: string; name: string; mode: FeedMode; last_taken_at: string | null; stale_after_minutes: number;
    stale_policy: StalePolicy; waiting: number; stale: boolean; stale_since: string | null }[];
}

export interface FeedCheck {
  id: string;
  partner_id: string;
  partner_name: string;
  kind: CheckKind;
  kind_label: string;
  item_key: string;
  product_id: string | null;
  product_name: string | null;
  product_schedule: string | null;
  product_cold_chain: boolean;
  item_name: string | null;
  batch_number: string | null;
  details: Record<string, any>;
  status: 'open' | 'accepted' | 'dismissed' | 'resolved';
  first_seen_at: string;
  last_seen_at: string;
}

export interface FeedSettingsInput {
  mode?: FeedMode;
  stale_after_minutes?: number;
  stale_policy?: StalePolicy;
  stale_margin_pct?: number;
  billing_grace_minutes?: number;
}

export interface AcceptInput {
  cold_chain_confirmed?: boolean;
  catalogue_price_accepted?: boolean;
  h1_pharmacist_name?: string;
  h1_pharmacist_reg_no?: string;
  h1_secure_storage_declared?: boolean;
}

/** How often the urgent badge asks the server again (the connector sends every 1–5 minutes). */
export const ALERT_POLL_MS = 60_000;

export const stockFeedKeys = {
  partnerAlerts: ['stock-feed', 'partner', 'alerts'] as const,
  partnerStatus: ['stock-feed', 'partner', 'status'] as const,
  partnerChecks: ['stock-feed', 'partner', 'checks'] as const,
  adminAlerts: ['stock-feed', 'admin', 'alerts'] as const,
  adminChecks: (partnerId: string | null) => ['stock-feed', 'admin', 'checks', partnerId ?? 'all'] as const,
  adminPartner: (partnerId: string) => ['stock-feed', 'admin', 'partner', partnerId] as const,
};

// ── Partner portal ───────────────────────────────────────────────────────────
export async function fetchPartnerFeedAlerts(): Promise<FeedAlerts> {
  const { data } = await api.get('/partner/stock-feed/alerts');
  return data.data;
}
export async function fetchPartnerFeed(): Promise<FeedStatus> {
  const { data } = await api.get('/partner/stock-feed');
  return data.data;
}
export async function fetchPartnerChecks(): Promise<FeedCheck[]> {
  const { data } = await api.get('/partner/stock-feed/checks');
  return data.data.checks;
}
export async function acceptCheck(id: string, body: AcceptInput) {
  const { data } = await api.post(`/partner/stock-feed/checks/${id}/accept`, body);
  return data.data;
}
export async function linkCheck(id: string, productId: string) {
  const { data } = await api.post(`/partner/stock-feed/checks/${id}/link`, { product_id: productId });
  return data.data as { status: string; product_name: string };
}
export async function requestProductForCheck(id: string) {
  const { data } = await api.post(`/partner/stock-feed/checks/${id}/request-product`, {});
  return data.data;
}
export async function dismissCheck(id: string, reason: string) {
  const { data } = await api.post(`/partner/stock-feed/checks/${id}/dismiss`, { reason });
  return data.data;
}

// ── Admin ────────────────────────────────────────────────────────────────────
export async function fetchAdminFeedAlerts(): Promise<AdminFeedAlerts> {
  const { data } = await api.get('/admin/stock-feeds/alerts');
  return data.data;
}
export async function fetchAdminChecks(partnerId: string | null): Promise<FeedCheck[]> {
  const { data } = await api.get('/admin/stock-feeds/checks', { params: partnerId ? { partner_id: partnerId } : {} });
  return data.data.checks;
}
export async function fetchAdminPartnerFeed(partnerId: string): Promise<FeedStatus> {
  const { data } = await api.get(`/admin/partners/${partnerId}/stock-feed`);
  return data.data;
}
export async function updateAdminPartnerFeed(partnerId: string, body: FeedSettingsInput): Promise<FeedStatus> {
  const { data } = await api.put(`/admin/partners/${partnerId}/stock-feed`, body);
  return data.data;
}

/** What a waiting item means and what the person does, in plain words. */
export const KIND_HELP: Record<CheckKind, string> = {
  new_product: 'Not on Dawabag yet. Link it to the right Dawabag product, ask Dawabag to add it, or set it aside if it is not sold online.',
  new_listing: 'On Dawabag, but you do not list it yet. List it at Dawabag\'s catalogue price (C-16); Dawabag reviews the listing before it sells.',
  cold_chain_batch: 'A new batch of a refrigerated medicine. Confirm it is stored at 2–8 °C before it is offered (C-25).',
  price_change: 'The MRP or your rate differs from the one accepted for this batch. The quantity is already updated; check the price (C-16).',
  expiry_change: 'Your software shows a later expiry than recorded. The earlier date is kept until you accept it (C-27).',
  short_for_orders: 'Your software shows fewer packs than Dawabag orders hold for this batch. Correct the software, or call Dawabag; this clears by itself.',
};
