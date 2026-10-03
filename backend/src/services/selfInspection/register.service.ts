// Self-inspection register (Sprint 40, rules.ts; O15; C-34): checklist templates kept by
// admins, inspections recorded by a pharmacist or admin (append-only with their results),
// corrective actions with an append-only status history (database triggers, migration 35).
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { istYear, todayIST } from '../../utils/ist';
import {
  ActionStatus, Frequency, ResultInput, TemplateItem, actionChangeProblem, inspectionProblems, itemKey, nextDueDate, templateProblems,
} from './rules';

export const RECORD_ROLES = ['pharmacist_rx', 'admin', 'super_admin'];
const ADMIN_ROLES = ['admin', 'super_admin'];

// ── Templates ────────────────────────────────────────────────────────────────
function cleanItems(items: { key?: string | null; label: string; guidance?: string | null }[]): TemplateItem[] {
  return items.map((i) => ({ key: (i.key?.trim() || itemKey(i.label)).slice(0, 60), label: i.label.trim(), guidance: i.guidance?.trim() || null }));
}

export async function listTemplates(includeInactive = false) {
  const rows = await query<any>(
    `SELECT t.id, t.name, t.frequency, t.items, t.is_active, to_char(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS created_on,
            (SELECT to_char(MAX(i.inspected_at) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') FROM self_inspections i WHERE i.template_id = t.id) AS last_inspected_on,
            (SELECT COUNT(*)::int FROM self_inspections i WHERE i.template_id = t.id) AS inspections
     FROM self_inspection_templates t ${includeInactive ? '' : 'WHERE t.is_active'} ORDER BY t.name`);
  const today = todayIST();
  return rows.map((t) => {
    const due = nextDueDate(t.last_inspected_on, t.created_on, t.frequency as Frequency);
    return { ...t, next_due_on: due, overdue: t.is_active && due < today };
  });
}

export async function saveTemplate(userId: string, input: { id?: string; name: string; frequency: string; is_active?: boolean;
  items: { key?: string | null; label: string; guidance?: string | null }[] }) {
  const items = cleanItems(input.items);
  const problems = templateProblems({ name: input.name, frequency: input.frequency, items });
  if (problems.length) throw new AppError(problems.join('; '), 400);
  return withTransaction(async (c) => {
    let row;
    try {
      row = input.id
        ? (await c.query(`UPDATE self_inspection_templates SET name = $2, frequency = $3, items = $4, is_active = COALESCE($5, is_active),
                            updated_by = $6, updated_at = NOW() WHERE id = $1 RETURNING id`,
          [input.id, input.name.trim(), input.frequency, JSON.stringify(items), input.is_active ?? null, userId])).rows[0]
        : (await c.query(`INSERT INTO self_inspection_templates (name, frequency, items, created_by, updated_by) VALUES ($1, $2, $3, $4, $4) RETURNING id`,
          [input.name.trim(), input.frequency, JSON.stringify(items), userId])).rows[0];
    } catch (e: any) {
      if (e.code === '23505') throw new AppError('A checklist with this name already exists', 409);
      throw e;
    }
    if (!row) throw new AppError('Checklist not found', 404);
    // Past inspections keep the items as they were (snapshotted in their results)
    await writeAuditTx(c, { userId: null, action: input.id ? 'self_inspection_template_updated' : 'self_inspection_template_created',
      performedBy: userId, newValue: { template_id: row.id, name: input.name.trim(), frequency: input.frequency, items: items.length, is_active: input.is_active ?? true } });
    return { id: row.id };
  });
}

// ── Inspections ──────────────────────────────────────────────────────────────
export async function recordInspection(user: { id: string; role: string }, templateId: string, input: { summary?: string | null; results: ResultInput[] }) {
  if (!RECORD_ROLES.includes(user.role)) throw new AppError('A pharmacist or an admin records self-inspections', 403);
  const t = await queryOne<any>(`SELECT id, name, items, is_active FROM self_inspection_templates WHERE id = $1`, [templateId]);
  if (!t || !t.is_active) throw new AppError('Checklist not found', 404);
  const items = t.items as TemplateItem[];
  const problems = inspectionProblems(items, input.results, todayIST());
  if (problems.length) throw new AppError(problems.slice(0, 12).join('; '), 400);
  const owners = [...new Set(input.results.filter((r) => r.action).map((r) => r.action!.owner_user_id))];
  if (owners.length) {
    const ok = await query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role IN ('admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack')
                                             AND is_active AND deleted_at IS NULL`, [owners]);
    if (ok.length !== owners.length) throw new AppError('A corrective action owner must be an active Dawabag staff member', 400);
  }
  const count = (r: string) => input.results.filter((x) => x.result === r).length;
  return withTransaction(async (c) => {
    const n = (await c.query(`SELECT nextval('self_inspection_seq') AS n`)).rows[0].n;
    const no = `SI-${istYear()}-${String(n).padStart(4, '0')}`;
    const name = (await c.query(`SELECT full_name FROM user_profiles WHERE user_id = $1`, [user.id])).rows[0]?.full_name ?? null;
    const insp = (await c.query(
      `INSERT INTO self_inspections (inspection_no, template_id, template_name, inspected_by, inspector_name, inspector_role, summary,
         ok_count, observation_count, non_conformity_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, inspection_no, inspected_at`,
      [no, t.id, t.name, user.id, name, user.role, input.summary?.trim() || null, count('ok'), count('observation'), count('non_conformity')])).rows[0];
    const actions: { id: string; action_no: string }[] = [];
    for (const item of items) {
      const r = input.results.find((x) => x.item_key === item.key)!;
      const res = (await c.query(
        `INSERT INTO self_inspection_results (inspection_id, item_key, item_label, result, note) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [insp.id, item.key, item.label, r.result, r.note?.trim() || null])).rows[0];
      if (r.action) {
        const an = (await c.query(`SELECT nextval('corrective_action_seq') AS n`)).rows[0].n;
        actions.push((await c.query(
          `INSERT INTO corrective_actions (action_no, inspection_id, result_id, description, owner_user_id, due_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, action_no`,
          [`CAPA-${istYear()}-${String(an).padStart(4, '0')}`, insp.id, res.id, r.action.description.trim(), r.action.owner_user_id,
           r.action.due_date, user.id])).rows[0]);
      }
    }
    await writeAuditTx(c, { userId: null, action: 'self_inspection_recorded', performedBy: user.id,
      newValue: { inspection_id: insp.id, inspection_no: no, template: t.name, ok: count('ok'), observations: count('observation'),
        non_conformities: count('non_conformity'), corrective_actions: actions.map((a) => a.action_no) } });
    return { ...insp, corrective_actions: actions };
  });
}

export async function listInspections(templateId?: string) {
  return query<any>(
    `SELECT i.id, i.inspection_no, i.template_id, i.template_name, i.inspector_name, i.inspector_role, i.inspected_at, i.summary,
            i.ok_count, i.observation_count, i.non_conformity_count,
            (SELECT COUNT(*)::int FROM corrective_actions a WHERE a.inspection_id = i.id AND a.status <> 'closed') AS open_actions
     FROM self_inspections i ${templateId ? 'WHERE i.template_id = $1' : ''} ORDER BY i.inspected_at DESC LIMIT 200`, templateId ? [templateId] : []);
}

const ACTION_COLS = `a.id, a.action_no, a.inspection_id, i.inspection_no, i.template_name, a.result_id, r.item_label, a.description,
  a.owner_user_id, ou.full_name AS owner_name, to_char(a.due_date, 'YYYY-MM-DD') AS due_date, a.status, a.close_out_note,
  a.closed_at, cu.full_name AS closed_by_name, a.created_at, (a.status <> 'closed' AND a.due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date) AS overdue`;
const ACTION_FROM = `FROM corrective_actions a JOIN self_inspections i ON i.id = a.inspection_id
  LEFT JOIN self_inspection_results r ON r.id = a.result_id LEFT JOIN user_profiles ou ON ou.user_id = a.owner_user_id
  LEFT JOIN user_profiles cu ON cu.user_id = a.closed_by`;

export async function getInspection(id: string) {
  const i = await queryOne<any>(`SELECT * FROM self_inspections WHERE id = $1`, [id]);
  if (!i) throw new AppError('Inspection not found', 404);
  const results = await query(`SELECT id, item_key, item_label, result, note FROM self_inspection_results WHERE inspection_id = $1 ORDER BY item_label`, [id]);
  const actions = await query<any>(`SELECT ${ACTION_COLS} ${ACTION_FROM} WHERE a.inspection_id = $1 ORDER BY a.action_no`, [id]);
  const events = actions.length ? await query<any>(
    `SELECT e.action_id, e.from_status, e.to_status, e.note, e.changed_at, up.full_name AS changed_by_name
     FROM corrective_action_events e LEFT JOIN user_profiles up ON up.user_id = e.changed_by
     WHERE e.action_id = ANY($1::uuid[]) ORDER BY e.changed_at`, [actions.map((a) => a.id)]) : [];
  return { ...i, results, actions: actions.map((a) => ({ ...a, history: events.filter((e) => e.action_id === a.id) })) };
}

export async function listActions(f: { status?: 'open' | 'closed' | 'overdue'; ownerId?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status === 'open') where.push(`a.status <> 'closed'`);
  if (f.status === 'closed') where.push(`a.status = 'closed'`);
  if (f.status === 'overdue') where.push(`a.status <> 'closed' AND a.due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date`);
  if (f.ownerId) { params.push(f.ownerId); where.push(`a.owner_user_id = $${params.length}`); }
  return query<any>(`SELECT ${ACTION_COLS} ${ACTION_FROM} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY (a.status = 'closed'), a.due_date LIMIT 300`, params);
}

/** The action's owner or an admin moves it on; every change goes into the history (trigger). */
export async function changeActionStatus(user: { id: string; role: string }, id: string, to: string, note: string | null) {
  return withTransaction(async (c) => {
    const a = (await c.query(`SELECT id, status, owner_user_id, action_no FROM corrective_actions WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!a) throw new AppError('Corrective action not found', 404);
    if (a.owner_user_id !== user.id && !ADMIN_ROLES.includes(user.role)) throw new AppError('Only the action\'s owner or an admin can update it', 403);
    const problem = actionChangeProblem(a.status as ActionStatus, to, note);
    if (problem) throw new AppError(problem, a.status === 'closed' ? 409 : 400);
    // The history row (trigger) records who changed it and why
    await c.query(`SELECT set_config('dawabag.action_note', $1, true), set_config('dawabag.action_by', $2, true)`, [note?.trim() || '', user.id]);
    await c.query(
      `UPDATE corrective_actions SET status = $2::varchar,
         close_out_note = CASE WHEN $2::varchar = 'closed' THEN $3::text ELSE close_out_note END,
         closed_by = CASE WHEN $2::varchar = 'closed' THEN $4::uuid ELSE NULL END,
         closed_at = CASE WHEN $2::varchar = 'closed' THEN NOW() ELSE NULL END
       WHERE id = $1`, [id, to, note?.trim() || null, user.id]);
    await writeAuditTx(c, { userId: null, action: 'corrective_action_status', performedBy: user.id,
      oldValue: { status: a.status }, newValue: { action_id: id, action_no: a.action_no, status: to }, notes: note?.trim() || null });
    return { id, status: to };
  });
}

/** People who may own a corrective action (Dawabag staff). */
export async function actionOwners() {
  return query<any>(`SELECT u.id, COALESCE(up.full_name, 'Staff member (' || u.role || ')') AS name, u.role FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE u.role IN ('admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack') AND u.is_active AND u.deleted_at IS NULL ORDER BY 2 LIMIT 300`);
}
