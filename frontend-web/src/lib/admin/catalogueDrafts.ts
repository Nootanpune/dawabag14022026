// Sprint 29 — draft products made from partner requests, and the pharmacist's
// "New products to complete" queue. The server holds every value and decides what
// is still missing (problems), the prescription rule and the suggested copy; this
// file only calls the API. Nothing is kept in the browser.
import api from '../api';
import type { OnlineSaleChange } from '../onlineSale/api';
import type { ProductClass } from '../productClass';
import type { Confidence, DraftSuggestion } from './catalogueSuggestions';

export interface FromFileEntry {
  request_id: string;
  partner_id: string;
  partner_name: string;
  item_name: string;
  pack: string | null;
  company: string | null;
  gst_rate: number | null;
  mrp_paise: number | null;
  hsn_code: string | null;
}

export interface Draft {
  id: string;
  sku: string;
  name: string;
  generic_name: string | null;
  composition: string | null;
  strength: string | null;
  dosage_form: string | null;
  drug_schedule: string | null;
  cold_chain: boolean;
  cold_chain_decided: boolean;
  /** Drugs Rules Schedule C / C1 (Sprint 34): sold only under Form 21 / 21B */
  schedule_c_c1: boolean;
  /** Sprint 40 (D6): product class and the NDCT Rules new-drug flag */
  product_class: ProductClass;
  is_new_drug: boolean;
  hsn_code: string | null;
  gst_rate: number | null;
  category: string | null;
  description: string | null;
  storage_instructions: string | null;
  net_quantity: string | null;
  marketed_by: string | null;
  manufacturer_name: string | null;
  manufacturer_address: string | null;
  country_of_origin: string | null;
  mrp_paise: number;
  status: 'open' | 'approved' | 'not_listed' | 'rejected';
  /** C-19 copy review of the live product: 'pending_review' while a changed description waits for the pharmacist */
  content_status: string | null;
  /** the usual GST rate of the chosen HSN in the HSN list (Sprint 31) */
  hsn_gst_rate: number | null;
  from_file: FromFileEntry & { requests?: FromFileEntry[] };
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
  requires_prescription: 'needed' | 'not needed' | 'never sold online' | null;
  problems: string[];
  warnings: string[];
  suggested_description: string | null;
  /** Sprint 46: the newest imported suggestion while the draft is open — shown, never a decision */
  suggestion: DraftSuggestion | null;
}

export interface DraftList {
  drafts: Draft[];
  total: number;
  page: number;
  limit: number;
  progress: { done: number; total: number };
  companies: { company: string; n: number }[];
  /** Sprint 46: open drafts with a suggestion, by confidence */
  with_suggestions?: Record<Confidence, number>;
}

export interface DraftFilters {
  status: 'open' | 'done';
  company: string;
  needs_schedule: boolean;
  cold_chain: '' | 'yes' | 'no' | 'undecided';
  q: string;
  /** Sprint 46: only drafts with a suggestion, high confidence first */
  suggested?: boolean;
  page: number;
}

export interface DraftOptions {
  schedules: string[];
  dosage_forms: string[];
  gst_rates: number[];
}

export type DraftPatch = Partial<Pick<Draft, 'name' | 'generic_name' | 'composition' | 'strength' | 'dosage_form' | 'drug_schedule'
  | 'cold_chain' | 'schedule_c_c1' | 'product_class' | 'is_new_drug' | 'hsn_code' | 'gst_rate' | 'category' | 'description' | 'storage_instructions' | 'net_quantity' | 'marketed_by'
  | 'manufacturer_name' | 'manufacturer_address' | 'country_of_origin'>>;

/** Fields "set for all selected" may change — never the schedule or anything clinical (server enforces the same). */
export const BULK_FIELDS = [
  { key: 'category', label: 'Category' },
  { key: 'hsn_code', label: 'HSN code' },
  { key: 'manufacturer_name', label: 'Manufacturer name' },
  { key: 'manufacturer_address', label: 'Manufacturer address' },
  { key: 'country_of_origin', label: 'Country of origin' },
] as const;
export type BulkKey = (typeof BULK_FIELDS)[number]['key'];

/** The storage line offered when a pharmacist marks a product cold chain (C-25). */
export const COLD_CHAIN_STORAGE = 'Store in a refrigerator at 2–8 °C. Do not freeze.';
export const NEVER_ONLINE = ['Schedule X', 'NDPS'];

export const draftKeys = {
  all: ['catalogue-drafts'] as const,
  list: (f: DraftFilters) => ['catalogue-drafts', 'list', f] as const,
  options: ['catalogue-drafts', 'options'] as const,
};

export async function fetchDrafts(f: DraftFilters): Promise<DraftList> {
  const params: Record<string, string | number> = { status: f.status, page: f.page, limit: 25 };
  if (f.company) params.company = f.company;
  if (f.needs_schedule) params.needs_schedule = 'true';
  if (f.cold_chain) params.cold_chain = f.cold_chain;
  if (f.q.trim()) params.q = f.q.trim();
  if (f.suggested) params.suggested = 'true';
  const { data } = await api.get('/catalogue-drafts', { params });
  return data.data;
}

export async function fetchDraftOptions(): Promise<DraftOptions> {
  const { data } = await api.get('/catalogue-drafts/options');
  return data.data;
}

export async function saveDraft(id: string, patch: DraftPatch): Promise<Draft> {
  const { data } = await api.patch(`/catalogue-drafts/${id}`, patch);
  return data.data;
}

/** The description for buyers at any time (Sprint 31): optional; on an approved product it goes back to the pharmacist (C-19). */
export async function saveDraftDescription(id: string, description: string | null): Promise<Draft> {
  const { data } = await api.patch(`/catalogue-drafts/${id}/description`, { description });
  return data.data;
}

export async function bulkSetDrafts(productIds: string[], set: Partial<Record<BulkKey, string | null>>): Promise<{ updated: number }> {
  const { data } = await api.post('/catalogue-drafts/bulk', { product_ids: productIds, set });
  return data.data;
}

/** Sprint 39: online_sale = the status step of the form (without it the approved product is not sold online yet) */
export async function approveDraft(id: string, notes?: string, onlineSale?: OnlineSaleChange) {
  const { data } = await api.post(`/catalogue-drafts/${id}/approve`, { ...(notes ? { notes } : {}), ...(onlineSale ? { online_sale: onlineSale } : {}) });
  return data.data as { id: string; status: 'approved' | 'not_listed'; sellable: boolean; online_sale_status?: string; requests: number };
}

export async function rejectDraft(id: string, reason: string) {
  const { data } = await api.post(`/catalogue-drafts/${id}/reject`, { reason });
  return data.data as { id: string; status: 'rejected'; requests: number };
}

export interface DraftsCreated {
  drafts_created: number;
  requests_drafted: number;
  requests_linked: number;
  grouped: number;
  skipped: { request_id: string; item_name: string; partner_name: string; reason: string }[];
}

/** Admin: open requests → draft products (requestIds = null → every open request). */
export async function createDrafts(requestIds: string[] | null): Promise<DraftsCreated> {
  const { data } = await api.post('/admin/partner-product-requests/drafts', requestIds ? { request_ids: requestIds } : { all_open: true });
  return data.data;
}

/** What a draft's copy says when it may make a claim (C-19): the server's warning names it. */
export const hasClaimWarning = (d: Draft) => d.warnings.some((w) => /claim/.test(w));
