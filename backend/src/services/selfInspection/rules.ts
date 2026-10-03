// Pure rules of the self-inspection register (Sprint 40; handover O15; Rulebook C-34
// records kept, C-25 storage, C-09 H1 register, C-46 who did what).
//   Templates: an admin defines a checklist (items) and how often it is due.
//   Inspection: a pharmacist or admin records a result for EVERY item — ok, observation
//   or non-conformity (a note for anything but ok). A non-conformity needs a corrective
//   action: what will be done, who owns it, by when. Results are append-only.
//   Corrective actions move open → in progress → closed (close-out note); every change is
//   kept in an append-only history; overdue actions alert admins (job self_inspection_watch).
// No database imports: unit-tested in rules.test.ts.

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const RESULTS = ['ok', 'observation', 'non_conformity'] as const;
export type ItemResult = (typeof RESULTS)[number];
export const ACTION_STATUSES = ['open', 'in_progress', 'closed'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export interface TemplateItem { key: string; label: string; guidance?: string | null }

/** 'Storage temperatures' → 'storage_temperatures' (stable keys for results). */
export function itemKey(label: string): string {
  return label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'item';
}

export function templateProblems(t: { name: string; frequency: string; items: TemplateItem[] }): string[] {
  const p: string[] = [];
  if (t.name.trim().length < 3) p.push('Give the checklist a name (at least 3 characters)');
  if (!(FREQUENCIES as readonly string[]).includes(t.frequency)) p.push('Choose weekly, monthly, quarterly or annual');
  if (!t.items.length) p.push('Add at least one item to check');
  if (t.items.length > 60) p.push('Up to 60 items per checklist');
  const keys = new Set<string>();
  t.items.forEach((i, n) => {
    if (String(i.label ?? '').trim().length < 3) p.push(`Item ${n + 1}: describe what is checked`);
    if (keys.has(i.key)) p.push(`Item ${n + 1}: the same item appears twice`);
    keys.add(i.key);
  });
  return p;
}

/** The date the next inspection is due: one period after the last one (or after the checklist was set up). */
export function nextDueDate(lastInspected: string | null, createdOn: string, frequency: Frequency): string {
  const d = new Date(`${(lastInspected ?? createdOn).slice(0, 10)}T00:00:00Z`);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (frequency === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export interface ActionInput { description: string; owner_user_id: string; due_date: string }
export interface ResultInput { item_key: string; result: string; note?: string | null; action?: ActionInput | null }

/** Plain reasons an inspection cannot be recorded (empty = fine). */
export function inspectionProblems(items: TemplateItem[], results: ResultInput[], today: string): string[] {
  const p: string[] = [];
  const byKey = new Map(results.map((r) => [r.item_key, r]));
  if (byKey.size !== results.length) p.push('An item is answered twice');
  const known = new Set(items.map((i) => i.key));
  for (const r of results) if (!known.has(r.item_key)) p.push(`"${r.item_key}" is not on this checklist`);
  for (const i of items) {
    const r = byKey.get(i.key);
    if (!r) { p.push(`Answer "${i.label}"`); continue; }
    if (!(RESULTS as readonly string[]).includes(r.result)) { p.push(`"${i.label}": choose ok, observation or non-conformity`); continue; }
    if (r.result !== 'ok' && String(r.note ?? '').trim().length < 5) p.push(`"${i.label}": say what was found (at least 5 characters)`);
    if (r.result === 'non_conformity' && !r.action) p.push(`"${i.label}": a non-conformity needs a corrective action (what, who, by when)`);
    if (r.action) {
      if (String(r.action.description ?? '').trim().length < 5) p.push(`"${i.label}": describe the corrective action`);
      if (!r.action.owner_user_id) p.push(`"${i.label}": choose who owns the corrective action`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.action.due_date ?? ''))) p.push(`"${i.label}": enter the due date (YYYY-MM-DD)`);
      else if (r.action.due_date < today) p.push(`"${i.label}": the due date cannot be in the past`);
    }
  }
  return p;
}

const NEXT: Record<ActionStatus, ActionStatus[]> = { open: ['in_progress', 'closed'], in_progress: ['open', 'closed'], closed: [] };

export function actionChangeProblem(from: ActionStatus, to: string, note: string | null | undefined): string | null {
  if (!(ACTION_STATUSES as readonly string[]).includes(to)) return 'Choose open, in progress or closed';
  if (from === 'closed') return 'A closed corrective action is final';
  if (!NEXT[from].includes(to as ActionStatus)) return `It is already ${from.replace('_', ' ')}`;
  if (to === 'closed' && String(note ?? '').trim().length < 5) return 'Say how it was put right (close-out note, at least 5 characters)';
  return null;
}

export const isOverdue = (dueDate: string, status: string, today: string) => status !== 'closed' && dueDate < today;
