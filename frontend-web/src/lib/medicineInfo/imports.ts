// Sprint 45 — imported medicine-information drafts (owner request 2026-10-03). The
// workbook stays only in the in-memory File object and is sent to the server, which
// reads it from memory; drafts live only on the server (standing rule). Every imported
// draft is checked and sent by a registered pharmacist and approved by a second one (C-19).
import api from '../api';
import { downloadFromApi } from '../download';
import type { ClaimFlag, ImportMeta } from './types';

export const MAX_DRAFTS_FILE_BYTES = 10 * 1024 * 1024;
export const DRAFT_COLUMNS = ['item_name', 'pack', 'company', 'assumed_composition', 'composition_confidence', 'drafting_note', 'content_json'] as const;

export const importKeys = {
  partners: ['medicine-info', 'import-partners'] as const,
  counts: ['medicine-info', 'imported-counts'] as const,
  drafts: (partnerId: string, status: string) => ['medicine-info', 'imported-drafts', partnerId, status] as const,
};

export type RowOutcome = 'created' | 'replaced' | 'unchanged' | 'already_has_information' | 'not_in_catalogue' | 'invalid';

export interface ImportRowResult {
  row: number;
  item_name: string;
  pack: string | null;
  company: string | null;
  outcome: RowOutcome;
  message: string | null;
  product_id: string | null;
  product_name: string | null;
  product_state: string | null;
  version: number | null;
  flags: ClaimFlag[];
  to_fix: string[];
}

export interface ImportDraftsResult {
  partner: { id: string; name: string };
  file_name: string;
  rows: number;
  counts: Record<RowOutcome, number> & { flagged: number };
  results: ImportRowResult[];
  not_in_catalogue_csv: string;
}

export interface ImportPartner { id: string; name: string; linked_items: number }

export interface ImportedDraft {
  id: string;
  product_id: string;
  version: number;
  status: 'draft' | 'pending_review';
  flags: ClaimFlag[];
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  import_meta: ImportMeta;
  import_partner_id: string | null;
  import_partner_name: string | null;
  product_name: string;
  sku: string;
  drug_schedule: string | null;
  catalogue_state: string;
  updated_by_name: string | null;
  author_names: string[];
  authored_by_you: boolean;
}

export interface ImportedCount { partner_id: string | null; partner_name: string | null; to_check: number; waiting_approval: number }

export const OUTCOME_LABEL: Record<RowOutcome, string> = {
  created: 'Draft created',
  replaced: 'Draft replaced',
  unchanged: 'Unchanged',
  already_has_information: 'Already has information',
  not_in_catalogue: 'Not in catalogue yet',
  invalid: 'Not imported (invalid)',
};

export function downloadDraftsTemplate() {
  return downloadFromApi('/medicines/info-imports/template', 'medicine_information_drafts_template.xlsx');
}

/** Returns an error message, or '' when the file can be sent. */
export function draftsFileError(file: File | null): string {
  if (!file) return 'Choose the filled-in drafts workbook (.xlsx)';
  if (!/\.xlsx$/i.test(file.name)) return 'Only .xlsx workbooks are accepted';
  if (file.size > MAX_DRAFTS_FILE_BYTES) return 'The file is larger than 10 MB; split it into smaller files';
  return '';
}

export async function fetchImportPartners(): Promise<ImportPartner[]> {
  const { data } = await api.get('/medicines/info-imports/partners');
  return data.data?.partners ?? [];
}

export async function importDrafts(file: File, partnerId: string, replaceDrafts: boolean): Promise<ImportDraftsResult> {
  const form = new FormData();
  form.append('partner_id', partnerId);
  if (replaceDrafts) form.append('replace_drafts', 'true');
  form.append('file', file);
  const { data } = await api.post('/medicines/info-imports', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
  return data.data;
}

export async function fetchImportedDrafts(partnerId: string, status: 'draft' | 'pending_review' = 'draft'): Promise<ImportedDraft[]> {
  const { data } = await api.get('/medicines/info-imports/drafts', { params: { status, ...(partnerId ? { partner_id: partnerId } : {}) } });
  return data.data?.versions ?? [];
}

export async function fetchImportedCounts(): Promise<ImportedCount[]> {
  const { data } = await api.get('/medicines/info-imports/counts');
  return data.data?.partners ?? [];
}
