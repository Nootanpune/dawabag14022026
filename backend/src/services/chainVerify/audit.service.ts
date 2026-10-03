// Audit log chain check (C-46; Sprint 38). See walk.ts.
import { query, queryOne } from '../../config/database';
import { AuditChainRow, auditCanonical } from '../../utils/hashChain';
import { VerifyReport, startPoint, walkInBatches } from './walk';

// ── Audit log ────────────────────────────────────────────────────────────────

const AUDIT_COLUMNS = `chain_seq::text AS chain_seq, id, created_at, user_id, action, entity, entity_id, metadata::text AS metadata,
  ip_address::text AS ip_address, user_agent, old_value::text AS old_value, new_value::text AS new_value, performed_by, notes,
  prev_hash, row_hash`;

export async function verifyAuditChain(opts: { from?: number; maxRows?: number } = {}): Promise<VerifyReport> {
  const legacy = Number((await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM audit_logs WHERE chain_legacy`, []))?.n ?? 0);
  const start = await startPoint(opts.from, `SELECT row_hash FROM audit_logs WHERE chain_seq = $1`, []);
  if ('problem' in start) return { ok: false, checked: 0, last_no: null, head_hash: null, first_break: start, legacy_rows: legacy, complete: true, next_from: null };
  const r = await walkInBatches(async (afterNo, limit) => (await query<AuditChainRow & { row_hash: string | null }>(
    `SELECT ${AUDIT_COLUMNS} FROM audit_logs WHERE chain_seq > $1 ORDER BY audit_logs.chain_seq LIMIT $2`, [afterNo, limit]))
    .map((x) => ({ no: Number(x.chain_seq), id: x.id, prev_hash: x.prev_hash, row_hash: x.row_hash, canonical: auditCanonical(x) })),
  start.no, start.prev, opts.maxRows ?? 200_000);
  if (r.ok && r.complete) {
    const unsealed = await queryOne<{ id: string }>(
      `SELECT id FROM audit_logs WHERE NOT chain_legacy AND row_hash IS NULL AND created_at < NOW() - INTERVAL '5 minutes' LIMIT 1`, []);
    if (unsealed) return { ...r, ok: false, legacy_rows: legacy, first_break: { no: null, id: unsealed.id, problem: 'An entry was never sealed (no number or hash)' } };
  }
  return { ...r, legacy_rows: legacy };
}
