// Daily self-inspection watch (Sprint 40; O15; C-34): admins (and the action's owner) are
// told once when a corrective action passes its due date, and once per due date when a
// checklist's inspection is overdue.
import { query } from '../../config/database';
import { queueNotification } from '../notification.service';
import { listTemplates } from './register.service';

export async function runSelfInspectionWatch() {
  const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active AND deleted_at IS NULL`);
  const overdue = await query<any>(
    `SELECT a.id, a.action_no, a.description, a.owner_user_id, to_char(a.due_date, 'YYYY-MM-DD') AS due_date, i.inspection_no, i.template_name
     FROM corrective_actions a JOIN self_inspections i ON i.id = a.inspection_id
     WHERE a.status <> 'closed' AND a.due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date AND a.overdue_alerted_at IS NULL`);
  for (const a of overdue) {
    const text = `Corrective action ${a.action_no} (${a.template_name}, ${a.inspection_no}) was due on ${a.due_date} and is not closed: ${String(a.description).slice(0, 200)}`;
    const to = new Set([...admins.map((x) => x.id), a.owner_user_id]);
    for (const id of to) await queueNotification({ userId: id, type: 'self_inspection_overdue', text });
    await query(`UPDATE corrective_actions SET overdue_alerted_at = NOW() WHERE id = $1`, [a.id]);
  }
  let templatesAlerted = 0;
  for (const t of (await listTemplates()).filter((x) => x.overdue)) {
    const marked = await query(`UPDATE self_inspection_templates SET overdue_alerted_for = $2::date
      WHERE id = $1 AND overdue_alerted_for IS DISTINCT FROM $2::date RETURNING id`, [t.id, t.next_due_on]);
    if (!marked.length) continue;
    for (const a of admins) {
      await queueNotification({ userId: a.id, type: 'self_inspection_overdue',
        text: `Self-inspection "${t.name}" (${t.frequency}) was due on ${t.next_due_on} and has not been recorded.` });
    }
    templatesAlerted++;
  }
  return { overdue_actions_alerted: overdue.length, overdue_checklists_alerted: templatesAlerted };
}
