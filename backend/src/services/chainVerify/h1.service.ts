// Schedule H1 register chain check, per seller licence (C-09; Sprint 38). See walk.ts.
import { query, queryOne } from '../../config/database';
import { H1ChainRow, h1Canonical } from '../../utils/hashChain';
import { VerifyReport, startPoint, walkInBatches } from './walk';

// ── H1 registers ─────────────────────────────────────────────────────────────

const H1_COLUMNS = `register_key, entry_no::text AS entry_no, id, dispensed_at, seller_type, partner_id, seller_licence_no,
  order_id, order_item_id, product_id, product_name, batch_number, quantity, patient_name, patient_address,
  prescriber_name, prescriber_address, prescriber_reg_no, prescription_id, pharmacist_name, pharmacist_reg_no,
  prev_hash, row_hash`;

export async function verifyH1Register(registerKey: string, opts: { from?: number; maxRows?: number } = {}): Promise<VerifyReport & { register_key: string }> {
  const legacy = Number((await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM h1_register WHERE register_key = $1 AND chain_legacy`, [registerKey]))?.n ?? 0);
  const unsealed = await queryOne<{ id: string }>(
    `SELECT id FROM h1_register WHERE register_key = $1 AND NOT chain_legacy AND row_hash IS NULL LIMIT 1`, [registerKey]);
  const start = await startPoint(opts.from,
    `SELECT row_hash FROM h1_register WHERE register_key = $1 AND entry_no = $2 AND NOT chain_legacy`, [registerKey]);
  if ('problem' in start) {
    return { register_key: registerKey, ok: false, checked: 0, last_no: null, head_hash: null, first_break: start, legacy_rows: legacy, complete: true, next_from: null };
  }
  const r = await walkInBatches(async (afterNo, limit) => (await query<H1ChainRow & { row_hash: string | null }>(
    `SELECT ${H1_COLUMNS} FROM h1_register
     WHERE register_key = $1 AND NOT chain_legacy AND entry_no > $2 ORDER BY h1_register.entry_no LIMIT $3`, [registerKey, afterNo, limit]))
    .map((x) => ({ no: Number(x.entry_no), id: x.id, prev_hash: x.prev_hash, row_hash: x.row_hash, canonical: h1Canonical(x) })),
  start.no, start.prev, opts.maxRows ?? 200_000);
  if (r.ok && unsealed) {
    return { register_key: registerKey, ...r, ok: false, legacy_rows: legacy,
      first_break: { no: null, id: unsealed.id, problem: 'An entry was never sealed (no number or hash)' } };
  }
  return { register_key: registerKey, ...r, legacy_rows: legacy };
}

/** Every register, or only one partner's (the partner portal). */
export async function verifyH1Registers(filter: { partnerId?: string } = {}) {
  const keys = (await query<{ register_key: string }>(
    `SELECT DISTINCT register_key FROM h1_register WHERE register_key IS NOT NULL ${filter.partnerId ? 'AND partner_id = $1' : ''}
     ORDER BY register_key`, filter.partnerId ? [filter.partnerId] : [])).map((r) => r.register_key);
  const registers = [];
  for (const k of keys) registers.push(await verifyH1Register(k));
  return { ok: registers.every((r) => r.ok), registers };
}

