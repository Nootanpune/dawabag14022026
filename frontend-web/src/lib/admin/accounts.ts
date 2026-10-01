// Accountant reports (admin): GST registers and marketplace TCS/TDS for the CA,
// built on request by the server (C-30, C-32, C-34). CSV goes straight from the
// API to the browser's save dialog; nothing is kept by the app.
import api from '../api';
import { downloadFromApi } from '../download';
import { lastMonthIST } from '../dates';

export type ReportRow = Record<string, unknown>;

export interface AccountsReport {
  report: string;
  from: string;
  to: string;
  rows: ReportRow[];
}

export const REPORT_LABELS: Record<string, string> = {
  'sales-register': 'Sales register',
  'credit-notes': 'Credit notes',
  'hsn-summary': 'HSN summary',
  'gstr1-summary': 'GSTR-1 summary',
  'marketplace-tcs-tds': 'Marketplace TCS / TDS',
  'purchase-register': 'Purchase register',
  'purchase-returns': 'Purchase returns',
  'stock-valuation': 'Stock valuation',
  'payment-reconciliation': 'Payment reconciliation (Razorpay)',
};

/** Reports the server limits to a shorter period; shown as a hint, the server's 400 is shown if exceeded. */
export const REPORT_PERIOD_HINTS: Record<string, string> = {
  'payment-reconciliation': 'Fetched live from Razorpay settlements: choose up to 31 days.',
};

// Razorpay settlement vs Dawabag ledger outcome per line
const RECON_STATUS_TONE: Record<string, string> = {
  matched: 'bg-green-50 text-green-700',
  amount_mismatch: 'bg-red-50 text-red-700',
  missing_in_dawabag: 'bg-red-50 text-red-700',
  not_yet_settled: 'bg-gray-100 text-gray-600',
};

/** Badge classes for a cell, or '' for plain text (only the reconciliation status is colour-coded). */
export function cellTone(report: string, col: string, value: unknown): string {
  if (report !== 'payment-reconciliation' || col !== 'status') return '';
  return RECON_STATUS_TONE[String(value)] ?? '';
}

export const accountsKeys = {
  names: ['accounts', 'reports'] as const,
  report: (name: string, from: string, to: string) => ['accounts', 'report', name, from, to] as const,
};

export async function fetchReportNames(): Promise<string[]> {
  const { data } = await api.get('/accounts/reports');
  return data.data?.reports ?? [];
}

export async function fetchReport(name: string, from: string, to: string): Promise<AccountsReport> {
  const { data } = await api.get(`/accounts/reports/${encodeURIComponent(name)}`, { params: { from, to }, timeout: 60000 });
  return data.data;
}

export function downloadReportCsv(name: string, from: string, to: string) {
  return downloadFromApi(`/accounts/reports/${encodeURIComponent(name)}`, `${name}-${from}-to-${to}.csv`, { from, to, format: 'csv' });
}

/** First and last day of the previous calendar month in India (IST). */
export function lastMonth(): { from: string; to: string } {
  return lastMonthIST();
}

/** Mirrors the server: from ≤ to, at most 13 months (400 days). '' when fine. */
export function periodError(from: string, to: string): string {
  if (!from || !to) return 'Choose both dates';
  if (from > to) return '"From" must be on or before "to"';
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 400) return 'Choose a period of up to 13 months';
  return '';
}

/** Column header: "taxable_value_paise" → "Taxable value (₹)". */
export function columnLabel(col: string): string {
  const paise = col.endsWith('_paise');
  const base = (paise ? col.slice(0, -6) : col).replace(/_/g, ' ');
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}${paise ? ' (₹)' : ''}`;
}

export function formatCell(col: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (col.endsWith('_paise')) {
    const n = Number(value);
    return Number.isFinite(n) ? (n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
