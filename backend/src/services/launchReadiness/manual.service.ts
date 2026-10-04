// Launch-checklist items the software cannot compute (Sprint 49): a lawyer's or CA's
// confirmation, DLT registration, the restore drill, the external penetration test…
// Stored on the server (launch_checklist_items, migration 44 — seeded from
// docs/LAUNCH_CHECKLIST.md). Only an admin changes status and note, in one transaction
// with the audit entry (C-46); the row's trigger refuses any other change.
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { ReadinessStatus } from './types';

export interface ManualRow {
  item_key: string; section: number; sort_order: number; title: string; who: string;
  link_href: string | null; link_label: string | null; status: ReadinessStatus; note: string | null;
  updated_at: string | null; updated_by_name: string | null;
}

export async function manualItems(): Promise<ManualRow[]> {
  return query<ManualRow>(
    `SELECT i.item_key, i.section, i.sort_order, i.title, i.who, i.link_href, i.link_label, i.status, i.note, i.updated_at,
            CASE WHEN i.updated_by IS NULL THEN NULL ELSE COALESCE(up.full_name, 'Staff member') END AS updated_by_name
     FROM launch_checklist_items i LEFT JOIN user_profiles up ON up.user_id = i.updated_by
     ORDER BY i.section, i.sort_order, i.item_key`);
}

export interface ManualUpdate { status: ReadinessStatus; note: string | null }

export async function updateManualItem(actorId: string, key: string, input: ManualUpdate, ip?: string | null): Promise<ManualRow> {
  await withTransaction(async (c) => {
    const old = (await c.query(`SELECT item_key, status, note FROM launch_checklist_items WHERE item_key = $1 FOR UPDATE`, [key])).rows[0];
    if (!old) throw new AppError('This checklist item does not exist', 404, true, 'LAUNCH_ITEM_NOT_FOUND');
    if (old.status === input.status && (old.note ?? null) === input.note) return;   // nothing changed: nothing recorded
    await c.query(`UPDATE launch_checklist_items SET status = $2, note = $3, updated_by = $4, updated_at = NOW() WHERE item_key = $1`,
      [key, input.status, input.note, actorId]);
    await writeAuditTx(c, { userId: null, action: 'launch_checklist_item_updated', performedBy: actorId, ip: ip ?? null,
      oldValue: { item_key: key, status: old.status, note: old.note }, newValue: { item_key: key, status: input.status, note: input.note } });
  });
  return (await manualItems()).find((r) => r.item_key === key)!;
}
