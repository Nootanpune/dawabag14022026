// Accountant reports (admin): GST registers and marketplace TCS/TDS for the CA,
// built on request by the server (C-30, C-32, C-34). CSV goes straight from the
// API to the browser's save dialog; nothing is kept by the app.
import api from '../api';
import { downloadFromApi } from '../download';

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
  'stock-valuation': 'Stock valuation',
};

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

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** First and last day of the previous calendar month (local time). */
export function lastMonth(today = new Date()): { from: string; to: string } {
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const last = new Date(today.getFullYear(), today.getMonth(), 0);
  return { from: ymd(first), to: ymd(last) };
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
