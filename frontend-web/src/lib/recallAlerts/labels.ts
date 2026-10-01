// Wording and client-side checks for regulator recall alerts (C-28). The server
// re-checks everything; these only save a round trip.
import type { AlertHeaderDraft, AlertLineDraft, AlertLineInput, AlertSource, MatchDecision } from './types';
import type { AlertHeaderBody } from './api';
import { istInputToIso, nowISTInput } from '@/lib/dates';

export const SOURCE_LABELS: Record<AlertSource, string> = {
  cdsco_nsq: 'CDSCO NSQ list',
  fda_maharashtra: 'FDA Maharashtra',
  manufacturer: 'Manufacturer recall',
  other: 'Other',
};

export const SOURCE_OPTIONS = (Object.keys(SOURCE_LABELS) as AlertSource[]).map((value) => ({ value, label: SOURCE_LABELS[value] }));

export const DECISION_LABELS: Record<MatchDecision, string> = {
  pending: 'To decide',
  recalled: 'Recalled',
  cleared: 'Not this product',
};

/** Headings the server looks for in an uploaded list (backend parse.ts). */
export const ACCEPTED_COLUMNS = ['Drug name', 'Batch No.', 'Manufacturer', 'Reason'] as const;

export const MAX_ALERT_FILE_BYTES = 5 * 1024 * 1024;

/** Returns an error message, or '' when the file can be sent. */
export function alertFileError(file: File | null): string {
  if (!file) return 'Choose the alert list (.xlsx or .csv)';
  if (!/\.(xlsx|csv)$/i.test(file.name)) return 'Only .xlsx or .csv files are accepted';
  if (file.size > MAX_ALERT_FILE_BYTES) return 'The file is larger than 5 MB';
  return '';
}

/** Header checks matching the server's zod schema (reference 3–200 chars). */
export function headerProblem(reference: string, receivedIso: string | undefined): string {
  if (reference.trim().length < 3) return 'Enter the alert reference (at least 3 characters)';
  if (!receivedIso) return 'Enter when the alert was received';
  if (new Date(receivedIso).getTime() > Date.now()) return 'The alert cannot be received in the future';
  return '';
}

let seq = 0;
export function blankAlertLine(): AlertLineDraft {
  seq += 1;
  return { key: `l${seq}`, drug_name: '', batch_number: '', manufacturer: '', reason: '' };
}

/** Non-blank typed rows → request lines, or the first problem found. */
export function linesFromDrafts(drafts: AlertLineDraft[]): { lines: AlertLineInput[]; problem: string } {
  const rows = drafts.filter((d) => d.drug_name.trim() || d.batch_number.trim() || d.manufacturer.trim() || d.reason.trim());
  if (!rows.length) return { lines: [], problem: 'Enter at least one line' };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.drug_name.trim().length < 2) return { lines: [], problem: `Line ${i + 1}: enter the drug name` };
    if (!r.batch_number.trim()) return { lines: [], problem: `Line ${i + 1}: enter the batch number` };
  }
  return {
    problem: '',
    lines: rows.map((r) => ({
      drug_name: r.drug_name.trim(),
      batch_number: r.batch_number.trim(),
      ...(r.manufacturer.trim() ? { manufacturer: r.manufacturer.trim() } : {}),
      ...(r.reason.trim() ? { reason: r.reason.trim() } : {}),
    })),
  };
}

/** A goods receipt refused because the batch is on a regulator alert (receiptGate.ts, 409). */
export function isRecallAlertError(message: string): boolean {
  return /recall alert RA-/.test(message);
}

/** Header draft → request header, or the first problem found. */
export function headerFromDraft(d: AlertHeaderDraft): { header?: AlertHeaderBody; problem: string } {
  const received_at = istInputToIso(d.received_local);
  const problem = headerProblem(d.reference, received_at);
  if (problem) return { problem };
  return { problem: '', header: { source: d.source, reference: d.reference.trim(), received_at: received_at! } };
}

export function blankHeader(): AlertHeaderDraft {
  return { source: 'cdsco_nsq', reference: '', received_local: nowISTInput() };
}
