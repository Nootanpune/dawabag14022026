// Self-inspection register (Sprint 40; O15; C-34): checklists, inspections with results,
// corrective actions and their status history — all kept on the server.
import api from '../api';

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'annual';
export type ItemResult = 'ok' | 'observation' | 'non_conformity';
export type ActionStatus = 'open' | 'in_progress' | 'closed';

export const RESULT_LABELS: Record<ItemResult, string> = { ok: 'OK', observation: 'Observation', non_conformity: 'Non-conformity' };
export const ACTION_LABELS: Record<ActionStatus, string> = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };
export const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'quarterly', 'annual'];

export interface TemplateItem { key: string; label: string; guidance?: string | null }
export interface Template {
  id: string;
  name: string;
  frequency: Frequency;
  items: TemplateItem[];
  is_active: boolean;
  last_inspected_on: string | null;
  next_due_on: string;
  overdue: boolean;
  inspections: number;
}
export interface InspectionRow {
  id: string;
  inspection_no: string;
  template_name: string;
  inspector_name: string | null;
  inspector_role: string;
  inspected_at: string;
  summary: string | null;
  ok_count: number;
  observation_count: number;
  non_conformity_count: number;
  open_actions: number;
}
export interface CorrectiveAction {
  id: string;
  action_no: string;
  inspection_no: string;
  template_name: string;
  item_label: string | null;
  description: string;
  owner_user_id: string;
  owner_name: string | null;
  due_date: string;
  status: ActionStatus;
  close_out_note: string | null;
  closed_at: string | null;
  closed_by_name: string | null;
  overdue: boolean;
  history?: { from_status: ActionStatus | null; to_status: ActionStatus; note: string | null; changed_at: string; changed_by_name: string | null }[];
}
export interface InspectionDetail extends InspectionRow {
  results: { id: string; item_key: string; item_label: string; result: ItemResult; note: string | null }[];
  actions: CorrectiveAction[];
}
export interface ResultInput {
  item_key: string;
  result: ItemResult;
  note?: string | null;
  action?: { description: string; owner_user_id: string; due_date: string } | null;
}

export const siKeys = {
  all: ['self-inspections'] as const,
  templates: (all: boolean) => ['self-inspections', 'templates', all] as const,
  list: ['self-inspections', 'list'] as const,
  one: (id: string) => ['self-inspections', 'one', id] as const,
  actions: (status: string) => ['self-inspections', 'actions', status] as const,
  people: ['self-inspections', 'people'] as const,
};

export async function fetchTemplates(all = false): Promise<Template[]> {
  const { data } = await api.get('/self-inspections/templates', { params: all ? { all: '1' } : {} });
  return data.data?.templates ?? [];
}
export async function saveTemplate(body: { id?: string; name: string; frequency: Frequency; is_active?: boolean; items: TemplateItem[] }) {
  const { id, ...rest } = body;
  const { data } = id ? await api.put(`/self-inspections/templates/${id}`, rest) : await api.post('/self-inspections/templates', rest);
  return data.data as { id: string };
}
export async function fetchInspections(): Promise<InspectionRow[]> {
  const { data } = await api.get('/self-inspections');
  return data.data?.inspections ?? [];
}
export async function fetchInspection(id: string): Promise<InspectionDetail> {
  const { data } = await api.get(`/self-inspections/${id}`);
  return data.data;
}
export async function recordInspection(body: { template_id: string; summary?: string | null; results: ResultInput[] }) {
  const { data } = await api.post('/self-inspections', body);
  return data.data as { id: string; inspection_no: string; corrective_actions: { id: string; action_no: string }[] };
}
export async function fetchActions(status: '' | 'open' | 'closed' | 'overdue'): Promise<CorrectiveAction[]> {
  const { data } = await api.get('/self-inspections/actions', { params: status ? { status } : {} });
  return data.data?.actions ?? [];
}
export async function changeAction(id: string, status: ActionStatus, note: string | null) {
  const { data } = await api.post(`/self-inspections/actions/${id}/status`, { status, note });
  return data.data;
}
export async function fetchActionOwners(): Promise<{ id: string; name: string; role: string }[]> {
  const { data } = await api.get('/self-inspections/people');
  return data.data?.people ?? [];
}

/** Client mirror of the server's inspection checks (services/selfInspection/rules.ts). */
export function inspectionProblem(items: TemplateItem[], results: Record<string, ResultInput>, today: string): string | null {
  for (const i of items) {
    const r = results[i.key];
    if (!r) return `Answer "${i.label}".`;
    if (r.result !== 'ok' && (r.note ?? '').trim().length < 5) return `"${i.label}": say what was found.`;
    if (r.result === 'non_conformity' && !r.action) return `"${i.label}": add a corrective action.`;
    if (r.action) {
      if (r.action.description.trim().length < 5) return `"${i.label}": describe the corrective action.`;
      if (!r.action.owner_user_id) return `"${i.label}": choose who owns the corrective action.`;
      if (!r.action.due_date || r.action.due_date < today) return `"${i.label}": choose a due date from today on.`;
    }
  }
  return null;
}
