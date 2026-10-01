// src/utils/audit.ts
// One way to write audit_logs (Rulebook C-46). `userId` is the account the
// action is about; `performedBy` is who did it (null = system/scheduler).
import { PoolClient } from 'pg';
import { query } from '../config/database';
import { logger } from '../config/logger';

export interface AuditEntry {
  userId: string | null;
  action: string;
  performedBy?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  notes?: string | null;
  ip?: string | null;
}

const SQL = `INSERT INTO audit_logs (user_id, action, old_value, new_value, performed_by, notes, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`;

function params(e: AuditEntry) {
  return [
    e.userId, e.action,
    e.oldValue === undefined ? null : JSON.stringify(e.oldValue),
    e.newValue === undefined ? null : JSON.stringify(e.newValue),
    e.performedBy ?? null, e.notes ?? null, e.ip ?? null,
  ];
}

// Inside a transaction: failure rolls the action back with it.
export async function writeAuditTx(client: PoolClient, e: AuditEntry): Promise<void> {
  await client.query(SQL, params(e));
}

// Outside a transaction: never let a logging failure break the request, but say so.
export async function writeAudit(e: AuditEntry): Promise<void> {
  try {
    await query(SQL, params(e));
  } catch (err) {
    logger.error(`Audit log write failed for ${e.action}: ${(err as Error).message}`);
  }
}
