// Partner stock import (Sprint 27). The chosen file stays only in the in-memory File
// object and is sent once to the server, which reads it in memory and keeps the parsed
// lines in its database; every later step reads and changes the server's copy
// (standing rule: nothing is stored in the browser). Checks — expiry (C-27), price
// vs MRP (C-16), Schedule X / NDPS (C-10), recalls (C-28) — are made by the server.
import api from '../api';

export const MAX_STOCK_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = /\.(xlsx|xls|csv|txt|tsv)$/i;

export type FieldKey =
  | 'item_name' | 'pack' | 'manufacturer' | 'hsn' | 'batch_number' | 'expiry' | 'mrp'
  | 'ptr' | 'sale_rate' | 'purchase_rate' | 'quantity' | 'free_quantity' | 'gst_rate' | 'item_code';
export type Mapping = Partial<Record<FieldKey, number | null>>;
export type RowTab = 'matched' | 'needs_review' | 'problem' | 'skipped';

export interface FieldInfo { key: FieldKey; label: string; required: boolean; hint: string }

export interface ImportSummary {
  lines: number;
  matched: number;
  needs_review: number;
  problem: number;
  skipped: number;
  requested: number;
  products: number;
  new_listings: number;
  cold_chain_products: number;
  h1_new_listings: number;
  packs: number;
}

export interface ApplyResult {
  lines_applied: number;
  products_updated: number;
  listings_created: number;
  batches_set: number;
  batches_zeroed: number;
  packs: number;
  skipped: { reason: string; lines: number; products: string[] }[];
  not_applied: { needs_review: number; problem: number };
}

export interface StockImport {
  id: string;
  file_name: string;
  file_kind: string;
  sheet_name: string | null;
  source_software: string | null;
  status: 'draft' | 'applied' | 'cancelled';
  created_at: string;
  applied_at: string | null;
  expires_at: string | null;
  expired: boolean;
  header_row: number;
  headers: string[];
  mapping: Mapping;
  mapping_source: 'suggested' | 'preset' | 'saved' | 'confirmed';
  mapping_confirmed: boolean;
  missing_fields: FieldKey[];
  column_samples: string[][];
  fields: FieldInfo[];
  row_count: number;
  summary: ImportSummary | null;
  result: ApplyResult | null;
  same_file_applied_at: string | null;
}

export interface ImportListItem {
  id: string;
  file_name: string;
  source_software: string | null;
  status: StockImport['status'];
  row_count: number;
  summary: ImportSummary | null;
  result: ApplyResult | null;
  created_at: string;
  applied_at: string | null;
  uploaded_by: string | null;
}

export interface Candidate { id: string; name: string; pack: string | null; schedule: string | null; mrp_paise: number; listed: boolean }

export interface ParsedLine {
  item_code: string | null;
  item_name: string | null;
  pack: string | null;
  manufacturer: string | null;
  batch_number: string | null;
  expiry_raw: string | null;
  expiry_date: string | null;
  mrp_paise: number | null;
  sale_rate_paise: number | null;
  total_quantity: number | null;
  filled_down: boolean;
}

export interface ImportRow {
  id: string;
  row_number: number;
  status: RowTab;
  parsed: ParsedLine | null;
  item_key: string | null;
  product_id: string | null;
  match_method: 'item_link' | 'listing' | 'catalogue' | 'manual' | null;
  problems: string[];
  warnings: string[];
  candidates: Candidate[];
  new_product_requested: boolean;
  product_name: string | null;
  product_pack: string | null;
  product_schedule: string | null;
  product_cold_chain: boolean | null;
  listed: boolean;
}

export interface RowsPage { rows: ImportRow[]; total: number; page: number; limit: number }

export interface ApplyInput {
  catalogue_price_accepted?: boolean;
  cold_chain_confirmed?: boolean;
  h1_pharmacist_name?: string;
  h1_pharmacist_reg_no?: string;
  h1_secure_storage_declared?: boolean;
}

export const stockImportKeys = {
  all: ['partner', 'stock-imports'] as const,
  list: ['partner', 'stock-imports', 'list'] as const,
  one: (id: string) => ['partner', 'stock-imports', id] as const,
  rows: (id: string, tab: RowTab, page: number) => ['partner', 'stock-imports', id, 'rows', tab, page] as const,
};

/** Returns an error message, or '' when the file can be sent. */
export function stockFileError(file: File | null): string {
  if (!file) return 'Choose the stock file exported from your billing software';
  if (!ACCEPTED.test(file.name)) return 'Choose an Excel (.xlsx, .xls) or CSV file';
  if (file.size > MAX_STOCK_FILE_BYTES) return 'The file is larger than 5 MB; export fewer rows at a time';
  if (file.size === 0) return 'The file is empty';
  return '';
}

export async function uploadStockFile(file: File): Promise<StockImport> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/partner/stock-imports', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
  return data.data;
}

export async function fetchStockImports(): Promise<ImportListItem[]> {
  const { data } = await api.get('/partner/stock-imports');
  return data.data?.imports ?? [];
}

export async function fetchStockImport(id: string): Promise<StockImport> {
  const { data } = await api.get(`/partner/stock-imports/${id}`);
  return data.data;
}

export async function fetchImportRows(id: string, status: RowTab, page: number, limit = 25): Promise<RowsPage> {
  const { data } = await api.get(`/partner/stock-imports/${id}/rows`, { params: { status, page, limit } });
  return data.data;
}

export async function saveMapping(id: string, mapping: Mapping): Promise<ImportSummary> {
  const { data } = await api.put(`/partner/stock-imports/${id}/mapping`, { mapping }, { timeout: 60000 });
  return data.data.summary;
}

export async function recheckImport(id: string): Promise<ImportSummary> {
  const { data } = await api.post(`/partner/stock-imports/${id}/recheck`, {}, { timeout: 60000 });
  return data.data.summary;
}

/** productId null forgets the link. */
export async function linkImportRow(id: string, rowId: string, productId: string | null) {
  const { data } = await api.patch(`/partner/stock-imports/${id}/rows/${rowId}`, { product_id: productId }, { timeout: 60000 });
  return data.data as { summary: ImportSummary };
}

/** rowIds omitted → every line still needing review. */
export async function requestNewProducts(id: string, rowIds?: string[]) {
  const { data } = await api.post(`/partner/stock-imports/${id}/request-new-products`, rowIds ? { row_ids: rowIds } : {}, { timeout: 60000 });
  return data.data as { items: number; new_requests: number; summary: ImportSummary };
}

export async function applyStockImport(id: string, body: ApplyInput): Promise<ApplyResult> {
  const { data } = await api.post(`/partner/stock-imports/${id}/apply`, body, { timeout: 120000 });
  return data.data.result;
}

export async function cancelStockImport(id: string) {
  const { data } = await api.post(`/partner/stock-imports/${id}/cancel`, {});
  return data.data;
}

export const STATUS_LABEL: Record<StockImport['status'], string> = {
  draft: 'Not applied yet', applied: 'Applied', cancelled: 'Cancelled',
};

export const MATCH_LABEL: Record<NonNullable<ImportRow['match_method']>, string> = {
  item_link: 'Remembered from before',
  listing: 'Your listing',
  catalogue: 'Same name, strength and pack',
  manual: 'Chosen by you',
};

/** Which details still need a column. */
export function missingFields(fields: FieldInfo[], mapping: Mapping): FieldInfo[] {
  return fields.filter((f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined));
}

/** A column chosen for two details. */
export function duplicateColumn(mapping: Mapping, headers: string[]): string | null {
  const seen = new Set<number>();
  for (const v of Object.values(mapping)) {
    if (v === null || v === undefined) continue;
    if (seen.has(v)) return headers[v] ?? `Column ${v + 1}`;
    seen.add(v);
  }
  return null;
}
