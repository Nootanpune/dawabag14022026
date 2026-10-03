// src/utils/hashChain.ts — canonical text and hash for the chained registers
// (Schedule H1 register C-09, audit log C-46; Sprint 38). Pure, unit-tested
// (hashChain.test.ts). The database seals each row with the same text
// (database/33_sprint38_registers_integrity.sql, dawabag_h1_canonical /
// dawabag_audit_canonical); the verify endpoints recompute every hash HERE, so a
// check does not depend on functions stored in the database being checked.
//
// Format — one line per field, in a fixed order, after a version line:
//   name=~                 the field is NULL (written explicitly, never skipped)
//   name=<bytes>:<value>   otherwise, <bytes> = UTF-8 byte length of <value>
// Timestamps: UTC ISO 8601 with milliseconds ("2026-10-03T04:05:06.789Z"), so the
// text never depends on a session or process time zone.
import crypto from 'crypto';

export type CanonValue = string | number | bigint | boolean | Date | null | undefined;

export const GENESIS_HASH = '0'.repeat(64);

export function canonTimestamp(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) throw new Error(`Not a timestamp: ${String(d)}`);
  return date.toISOString();   // always UTC, always milliseconds
}

function text(v: CanonValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return canonTimestamp(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export function canonField(name: string, value: CanonValue): string {
  const t = text(value);
  return t === null ? `${name}=~` : `${name}=${Buffer.byteLength(t, 'utf8')}:${t}`;
}

/** The canonical text of a row: version line, then each field in the given order. */
export function canonicalText(version: string, fields: [string, CanonValue][]): string {
  return [version, ...fields.map(([n, v]) => canonField(n, v))].join('\n');
}

export const sha256Hex = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// ── The two chained tables (field order = the SQL functions in migration 33) ──

/** A row of h1_register as read for verification (uuid/bigint as strings, timestamps as Date). */
export interface H1ChainRow {
  register_key: string; entry_no: string | number; id: string; dispensed_at: Date | string;
  seller_type: string; partner_id: string | null; seller_licence_no: string | null;
  order_id: string; order_item_id: string; product_id: string; product_name: string;
  batch_number: string | null; quantity: number; patient_name: string; patient_address: string;
  prescriber_name: string; prescriber_address: string | null; prescriber_reg_no: string | null;
  prescription_id: string | null; pharmacist_name: string | null; pharmacist_reg_no: string | null;
  prev_hash: string | null;
}

export function h1Canonical(r: H1ChainRow): string {
  return canonicalText('dawabag-h1-register-v1', [
    ['register_key', r.register_key], ['entry_no', r.entry_no], ['id', r.id],
    ['dispensed_at', r.dispensed_at instanceof Date ? r.dispensed_at : new Date(r.dispensed_at)],
    ['seller_type', r.seller_type], ['partner_id', r.partner_id], ['seller_licence_no', r.seller_licence_no],
    ['order_id', r.order_id], ['order_item_id', r.order_item_id], ['product_id', r.product_id],
    ['product_name', r.product_name], ['batch_number', r.batch_number], ['quantity', r.quantity],
    ['patient_name', r.patient_name], ['patient_address', r.patient_address],
    ['prescriber_name', r.prescriber_name], ['prescriber_address', r.prescriber_address],
    ['prescriber_reg_no', r.prescriber_reg_no], ['prescription_id', r.prescription_id],
    ['pharmacist_name', r.pharmacist_name], ['pharmacist_reg_no', r.pharmacist_reg_no], ['prev_hash', r.prev_hash],
  ]);
}

/** A row of audit_logs as read for verification; JSON and inet columns read as their database text (::text). */
export interface AuditChainRow {
  chain_seq: string | number; id: string; created_at: Date | string; user_id: string | null; action: string;
  entity: string | null; entity_id: string | null; metadata: string | null; ip_address: string | null;
  user_agent: string | null; old_value: string | null; new_value: string | null; performed_by: string | null;
  notes: string | null; prev_hash: string | null;
}

export function auditCanonical(r: AuditChainRow): string {
  return canonicalText('dawabag-audit-v1', [
    ['chain_seq', r.chain_seq], ['id', r.id],
    ['created_at', r.created_at instanceof Date ? r.created_at : new Date(r.created_at)],
    ['user_id', r.user_id], ['action', r.action], ['entity', r.entity], ['entity_id', r.entity_id],
    ['metadata', r.metadata], ['ip_address', r.ip_address], ['user_agent', r.user_agent],
    ['old_value', r.old_value], ['new_value', r.new_value], ['performed_by', r.performed_by],
    ['notes', r.notes], ['prev_hash', r.prev_hash],
  ]);
}

// ── Walking a chain ──────────────────────────────────────────────────────────

export interface ChainLink { no: number; id: string; prev_hash: string | null; row_hash: string | null; canonical: string }
export interface ChainBreak { no: number | null; id: string | null; problem: string }
export interface ChainResult { ok: boolean; checked: number; last_no: number | null; head_hash: string | null; first_break: ChainBreak | null }

/**
 * Checks links in order: numbers run on without a gap from `startNo`, each row
 * points at the previous row's hash (`startPrev` for the first), and each row's
 * stored hash equals the hash of its content. Reports the FIRST broken entry.
 */
export function walkChain(links: ChainLink[], startNo = 1, startPrev: string = GENESIS_HASH): ChainResult {
  let expectNo = startNo;
  let prev = startPrev;
  let checked = 0;
  for (const l of links) {
    const fail = (problem: string): ChainResult =>
      ({ ok: false, checked, last_no: expectNo - 1 >= startNo ? expectNo - 1 : null, head_hash: prev, first_break: { no: l.no, id: l.id, problem } });
    if (!l.row_hash) return fail('This entry was never sealed (no hash)');
    if (l.no !== expectNo) {
      return fail(l.no > expectNo
        ? `Entries ${expectNo}${l.no - 1 > expectNo ? `–${l.no - 1}` : ''} are missing`
        : `Entry number ${l.no} is out of order (expected ${expectNo})`);
    }
    if (l.prev_hash !== prev) return fail('The link to the previous entry does not match (an entry before it was changed, removed or inserted)');
    if (sha256Hex(l.canonical) !== l.row_hash) return fail('The content of this entry was changed after it was written');
    prev = l.row_hash;
    expectNo++;
    checked++;
  }
  return { ok: true, checked, last_no: checked ? expectNo - 1 : null, head_hash: checked ? prev : null, first_break: null };
}
