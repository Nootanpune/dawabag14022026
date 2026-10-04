// Admin → Launch readiness (Sprint 49): the live docs/LAUNCH_CHECKLIST.md, computed by the
// server on every load (no local copy). Manual items are changed only through the API,
// which records each change in the audit log (C-46). The server never sends a secret's
// value — only whether it is set (C-41, C-44).
import api from '../api';

export type ReadinessStatus = 'done' | 'in_progress' | 'not_started' | 'not_applicable';

export interface ReadinessItem {
  key: string;
  ref: string;
  section: number;
  kind: 'computed' | 'manual';
  title: string;
  who: string;
  status: ReadinessStatus;
  status_label: string;
  evidence: string[];
  link: { href: string; label: string } | null;
  note?: string | null;
  updated_at?: string | null;
  updated_by_name?: string | null;
}

export interface ReadinessSummary { ready: number; total: number; in_progress: number; not_started: number; not_applicable: number }

export interface ReadinessSection { section: number; title: string; summary: ReadinessSummary; items: ReadinessItem[] }

export interface LaunchReadiness {
  checked_at: string;
  app_env: string;
  summary: ReadinessSummary;
  sections: ReadinessSection[];
}

export const launchReadinessKey = ['admin', 'launch-readiness'] as const;

export async function fetchLaunchReadiness(): Promise<LaunchReadiness> {
  const { data } = await api.get('/admin/launch-readiness');
  return data.data;
}

export async function updateManualItem(key: string, body: { status: ReadinessStatus; note: string | null }): Promise<ReadinessItem> {
  const { data } = await api.put(`/admin/launch-readiness/manual/${encodeURIComponent(key)}`, body);
  return data.data;
}

/** Choices for a manual item; "not applicable" reads "Not needed" there. */
export const MANUAL_STATUS_OPTIONS: { value: ReadinessStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'not_applicable', label: 'Not needed' },
];

export const STATUS_TONE: Record<ReadinessStatus, string> = {
  done: 'bg-green-100 text-green-800',
  in_progress: 'bg-amber-100 text-amber-800',
  not_started: 'bg-red-100 text-red-800',
  not_applicable: 'bg-gray-100 text-gray-600',
};

/** "X of Y ready" — items not applicable on this server are left out of Y. */
export const readyText = (s: ReadinessSummary) => `${s.ready} of ${s.total} ready`;
