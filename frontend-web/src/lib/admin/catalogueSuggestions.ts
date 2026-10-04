// Sprint 46 — catalogue suggestions for one partner's DRAFT products (owner request
// 2026-10-04). The workbook stays only in the in-memory File object and is sent to the
// server, which reads it from memory; suggestions live only on the server (standing rule).
// A suggestion is shown on "New products to complete" and is never a decision: the
// pharmacist saves what they decide and approves each product (C-10, C-19).
import api from '../api';
import { downloadFromApi } from '../download';
import type { DraftPatch } from './catalogueDrafts';

export const MAX_SUGGESTIONS_FILE_BYTES = 10 * 1024 * 1024;
export const SUGGESTION_COLUMNS = [
  'item_name', 'pack', 'company', 'generic_name', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain',
  'product_class', 'is_new_drug', 'category', 'hsn_code', 'gst_rate', 'confidence', 'note',
] as const;

export type SuggestionOutcome = 'attached' | 'replaced' | 'unchanged' | 'already_in_catalogue' | 'no_draft_yet' | 'invalid';
export type Confidence = 'high' | 'medium' | 'low';

export interface SuggestionFlag { field: 'category' | 'hsn_code' | 'gst_rate'; message: string }

/** The suggested values — the same keys as the draft's decided fields; a blank cell is left out. */
export type SuggestedValues = Partial<Pick<Required<DraftPatch>, 'generic_name' | 'strength' | 'dosage_form' | 'drug_schedule' | 'cold_chain'
  | 'product_class' | 'is_new_drug' | 'category' | 'hsn_code' | 'gst_rate'>>;
export type SuggestedKey = keyof SuggestedValues;

/** The newest imported suggestion of an open draft (GET /catalogue-drafts). */
export interface DraftSuggestion {
  id: string;
  suggested: SuggestedValues;
  flags: SuggestionFlag[];
  confidence: Confidence;
  note: string | null;
  item_name: string;
  pack: string | null;
  company: string | null;
  partner_name: string | null;
  imported_by_name: string | null;
  imported_at: string;
  file_name: string | null;
}

export interface SuggestionRowResult {
  row: number;
  item_name: string;
  pack: string | null;
  company: string | null;
  outcome: SuggestionOutcome;
  message: string | null;
  product_id: string | null;
  product_name: string | null;
  confidence: Confidence | null;
  flags: SuggestionFlag[];
  request_id: string | null;
}

export interface SuggestionImportResult {
  partner: { id: string; name: string };
  file_name: string;
  rows: number;
  counts: Record<SuggestionOutcome, number> & { flagged: number };
  results: SuggestionRowResult[];
  open_request_ids: string[];
  no_draft_csv: string;
}

export interface SuggestionFormat {
  sheet: string;
  columns: string[];
  allowed: { drug_schedule: string[]; dosage_form: string[]; product_class: string[]; gst_rate: number[]; cold_chain: string[]; is_new_drug: string[]; confidence: string[] };
}

export const OUTCOME_LABEL: Record<SuggestionOutcome, string> = {
  attached: 'Suggestion added',
  replaced: 'Suggestion replaced',
  unchanged: 'Unchanged',
  already_in_catalogue: 'Already in catalogue',
  no_draft_yet: 'No draft yet',
  invalid: 'Not imported (invalid)',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

/** Labels of the suggested fields, in the form's order. */
export const SUGGESTED_FIELDS: { key: SuggestedKey; label: string }[] = [
  { key: 'drug_schedule', label: 'Drug schedule' },
  { key: 'generic_name', label: 'Generic name' },
  { key: 'strength', label: 'Strength' },
  { key: 'dosage_form', label: 'Dosage form' },
  { key: 'cold_chain', label: 'Cold chain' },
  { key: 'product_class', label: 'Product class' },
  { key: 'is_new_drug', label: 'New drug' },
  { key: 'category', label: 'Category' },
  { key: 'hsn_code', label: 'HSN code' },
  { key: 'gst_rate', label: 'GST rate' },
];

export function showSuggested(key: SuggestedKey, v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (key === 'cold_chain') return v ? 'Yes, 2–8 °C' : 'No';
  if (key === 'is_new_drug') return v ? 'Yes' : 'No';
  if (key === 'gst_rate') return `${v}%`;
  return String(v);
}

export const suggestionKeys = { format: ['catalogue-suggestions', 'format'] as const };

export function downloadSuggestionsTemplate() {
  return downloadFromApi('/catalogue-suggestions/template', 'catalogue_suggestions_template.xlsx');
}

/** Returns an error message, or '' when the file can be sent. */
export function suggestionsFileError(file: File | null): string {
  if (!file) return 'Choose the filled-in suggestions workbook (.xlsx)';
  if (!/\.xlsx$/i.test(file.name)) return 'Only .xlsx workbooks are accepted';
  if (file.size > MAX_SUGGESTIONS_FILE_BYTES) return 'The file is larger than 10 MB; split it into smaller files';
  return '';
}

export async function fetchSuggestionFormat(): Promise<SuggestionFormat> {
  const { data } = await api.get('/catalogue-suggestions/format');
  return data.data;
}

export async function importSuggestions(file: File, partnerId: string): Promise<SuggestionImportResult> {
  const form = new FormData();
  form.append('partner_id', partnerId);
  form.append('file', file);
  const { data } = await api.post('/catalogue-suggestions/imports', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
  return data.data;
}
