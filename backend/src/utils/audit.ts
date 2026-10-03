// src/utils/audit.ts
// One way to write audit_logs (Rulebook C-46). `userId` is the account the
// action is about; `performedBy` is who did it (null = system/scheduler).
import { PoolClient } from 'pg';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from './AppError';

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

/** Raised when an audit entry could not be written (Sprint 38, C-46). */
export class AuditWriteError extends AppError {
  constructor(action: string) {
    super(`This could not be recorded in the audit log (${action}). Please try again; if it keeps happening, tell the administrator.`,
      503, true, 'AUDIT_WRITE_FAILED');
  }
}

const RETRY_DELAYS_MS = [50, 250];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Outside a transaction. Sprint 38: an audit entry is never dropped silently — a
// failed write is retried twice, then logged and thrown, so the request fails loudly
// (C-46). Regulated actions belong in their transaction with writeAuditTx instead, and
// callers that release data (e.g. the H1 export) write the entry before sending it.
export async function writeAudit(e: AuditEntry): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await query(SQL, params(e));
      return;
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        logger.error(`Audit log write failed for ${e.action} after ${attempt + 1} attempts: ${(err as Error).message}`);
        throw new AuditWriteError(e.action);
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}
