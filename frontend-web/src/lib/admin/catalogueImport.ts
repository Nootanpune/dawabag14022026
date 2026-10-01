// Catalogue + opening-stock import (admin). The chosen .xlsx stays only in the
// in-memory File object and is sent to the server for preview and commit; the
// server reads it from memory too (standing rule: nothing stored locally).
// Changed product copy goes back to the pharmacist (C-19); expired stock is refused (C-27).
import api from '../api';
import { downloadFromApi } from '../download';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ImportAction = 'create' | 'update' | 'unchanged' | 'error';

export interface ImportRow {
  row: number;
  sku: string;
  action: ImportAction;
  errors: string[];
  warnings: string[];
  record: Record<string, unknown> | null;
}

export interface ImportSummary {
  products: { create: number; update: number; unchanged: number; error: number };
  batches: { create: number; error: number };
}

export interface ImportPreview {
  summary: ImportSummary;
  products: ImportRow[];
  batches: ImportRow[];
}

export function downloadCatalogueTemplate() {
  return downloadFromApi('/catalogue/template', '01_Medicine_and_Inventory.xlsx');
}

/** Returns an error message, or '' when the file can be sent. */
export function importFileError(file: File | null): string {
  if (!file) return 'Choose the filled-in .xlsx template';
  if (!/\.xlsx$/i.test(file.name)) return 'Only .xlsx files are accepted';
  if (file.size > MAX_IMPORT_BYTES) return 'The file is larger than 5 MB';
  return '';
}

function form(file: File) {
  const f = new FormData();
  f.append('file', file);
  return f;
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };

export async function previewImport(file: File): Promise<ImportPreview> {
  const { data } = await api.post('/catalogue/import/preview', form(file), multipart);
  return data.data;
}

/** Whole file in one transaction; 422 when rows have errors unless skipErrors. */
export async function commitImport(file: File, skipErrors: boolean): Promise<{ summary: ImportSummary }> {
  const { data } = await api.post('/catalogue/import/commit', form(file), {
    ...multipart,
    params: skipErrors ? { skip_errors: 'true' } : undefined,
  });
  return data.data;
}
