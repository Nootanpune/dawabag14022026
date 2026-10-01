// Regulator recall / NSQ alerts (admin) — Rulebook C-28. Shapes mirror
// backend/src/services/recallAlerts/alert.service.ts (listAlerts / getAlert).

export type AlertSource = 'cdsco_nsq' | 'fda_maharashtra' | 'manufacturer' | 'other';
export type MatchDecision = 'pending' | 'recalled' | 'cleared';

export interface AlertSummary {
  id: string;
  alert_no: string;
  source: AlertSource;
  reference: string;
  received_at: string;
  /** received_at + 4 hours (C-28) */
  due_at: string;
  entered_at: string;
  entered_by_name: string | null;
  lines: number;
  matches: number;
  pending: number;
  recalled: number;
  cleared: number;
  /** server: pending matches and past due_at */
  overdue: boolean;
}

export interface AlertMatch {
  id: string;
  product_id: string;
  product_name: string;
  manufacturer: string | null;
  /** how the batch is spelled in our stock */
  batch_numbers: string[] | null;
  units_held: number | null;
  units_sold: number | null;
  decision: MatchDecision;
  recall_id: string | null;
  notes: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
}

export interface AlertLine {
  id: string;
  line_no: number;
  drug_name: string;
  batch_number: string;
  manufacturer: string | null;
  reason: string | null;
  matches: AlertMatch[];
}

/** GET /recalls/alerts/:id — the summary, with `lines` replaced by the lines
 *  themselves (matched lines first, then by line_no). */
export interface AlertDetail extends Omit<AlertSummary, 'lines'> {
  lines: AlertLine[];
}

export interface AlertCreated {
  id: string;
  alert_no: string;
  due_at: string;
  lines: number;
  matches: number;
}

export interface AlertHeaderDraft {
  source: AlertSource;
  reference: string;
  /** datetime-local value, read as India time */
  received_local: string;
}

export interface AlertLineDraft {
  key: string;
  drug_name: string;
  batch_number: string;
  manufacturer: string;
  reason: string;
}

export interface AlertLineInput {
  drug_name: string;
  batch_number: string;
  manufacturer?: string;
  reason?: string;
}
