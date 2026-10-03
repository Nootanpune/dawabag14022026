// Shared walk for the chain checks (h1.service, audit.service). Recomputes the hash chains of the Schedule H1 registers (C-09) and the audit log
// (C-46) and reports the first broken entry (Sprint 38). Every hash is recomputed in
// this process from the stored values (utils/hashChain.ts), not by the database
// functions that wrote it. Rows from before Sprint 38 (chain_legacy) are counted, not
// checked. Limitation: removing the newest entries leaves a shorter chain that still
// verifies — compare head_hash with an earlier result (the export carries it).
import { queryOne } from '../../config/database';
import { ChainBreak, ChainLink, GENESIS_HASH, walkChain } from '../../utils/hashChain';

export const BATCH = 2000;

export interface VerifyReport {
  ok: boolean;
  checked: number;
  last_no: number | null;
  head_hash: string | null;
  first_break: ChainBreak | null;
  legacy_rows: number;
  complete: boolean;          // false = stopped at max_rows; continue with from = next_from
  next_from: number | null;
}

export async function walkInBatches(
  load: (afterNo: number, limit: number) => Promise<ChainLink[]>,
  startNo: number, startPrev: string, maxRows: number,
): Promise<Omit<VerifyReport, 'legacy_rows'>> {
  let expectNo = startNo;
  let prev = startPrev;
  let checked = 0;
  for (;;) {
    const links = await load(expectNo - 1, Math.min(BATCH, maxRows - checked));
    if (!links.length) break;
    const r = walkChain(links, expectNo, prev);
    checked += r.checked;
    if (!r.ok) return { ok: false, checked, last_no: expectNo - 1 + r.checked || null, head_hash: r.head_hash, first_break: r.first_break, complete: true, next_from: null };
    expectNo += r.checked;
    prev = r.head_hash ?? prev;
    if (checked >= maxRows) return { ok: true, checked, last_no: expectNo - 1, head_hash: prev, first_break: null, complete: false, next_from: expectNo };
  }
  return { ok: true, checked, last_no: expectNo - 1 >= startNo ? expectNo - 1 : (startNo > 1 ? startNo - 1 : null),
    head_hash: checked ? prev : (startNo > 1 ? startPrev : null), first_break: null, complete: true, next_from: null };
}

/** Where a check that starts part-way along a chain picks up: the stored hash of the entry before. */
export async function startPoint(from: number | undefined, prevHashSql: string, params: unknown[]): Promise<{ no: number; prev: string } | ChainBreak> {
  if (!from || from <= 1) return { no: 1, prev: GENESIS_HASH };
  const row = await queryOne<{ row_hash: string | null }>(prevHashSql, [...params, from - 1]);
  if (!row?.row_hash) return { no: from - 1, id: null, problem: `Entry ${from - 1} (before the starting point) is missing or unsealed` };
  return { no: from, prev: row.row_hash };
}

