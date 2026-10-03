// Nightly chain check with recorded heads (Sprint 40; follow-up of Sprint 38; C-09, C-46).
// Recomputes every Schedule H1 register chain and the audit-log chain (h1.service,
// audit.service), then compares each chain with the head recorded by the previous good
// run: the entry that was the head must still be there with the same hash. A chain cut
// short (newest entries removed) — which a plain walk cannot see — is reported as a
// break. Each run appends the new heads (number + hash) to chain_heads (append-only),
// and any break alerts every admin at once.
import { query, queryOne } from '../../config/database';
import { getRedis } from '../../config/redis';
import { AppError } from '../../utils/AppError';
import { getSetting } from '../settings.service';
import { writeAudit } from '../../utils/audit';
import { queueNotification } from '../notification.service';
import { verifyAuditChain } from './audit.service';
import { verifyH1Register } from './h1.service';
import { VerifyReport } from './walk';

/**
 * Where each chain's check starts (setting integrity.chain_start, e.g. {"audit": 2823}):
 * only for a database whose chain was legitimately restarted — a test database whose
 * clean-ups remove rows, or a restore documented in the RUNBOOK. Absent = from entry 1.
 * Changing it is a settings change (super-admin, audited) and the page shows it.
 */
export async function chainStarts(): Promise<Record<string, number>> {
  const v = await getSetting<Record<string, unknown>>('integrity.chain_start', {});
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v && typeof v === 'object' ? v : {})) if (Number.isInteger(Number(n)) && Number(n) > 1) out[k] = Number(n);
  return out;
}

export interface ChainRunResult {
  chain: string;
  from: number;
  ok: boolean;
  checked: number;
  last_no: number | null;
  head_hash: string | null;
  problem: string | null;
  previous_head: { last_no: number; head_hash: string; recorded_at: string } | null;
}

async function previousHead(chain: string) {
  return queryOne<{ last_no: string; head_hash: string; recorded_at: string }>(
    `SELECT last_no::text AS last_no, head_hash, recorded_at FROM chain_heads
     WHERE chain = $1 AND ok AND last_no IS NOT NULL AND head_hash IS NOT NULL ORDER BY recorded_at DESC LIMIT 1`, [chain]);
}

/** The entry that was the head last time: still there, still the same? (null = fine) */
export async function headProblem(chain: string, prev: { last_no: number; head_hash: string; recorded_at: string } | null,
  report: Pick<VerifyReport, 'last_no'>): Promise<string | null> {
  if (!prev) return null;
  const row = chain === 'audit'
    ? await queryOne<{ row_hash: string | null }>(`SELECT row_hash FROM audit_logs WHERE chain_seq = $1`, [prev.last_no])
    : await queryOne<{ row_hash: string | null }>(`SELECT row_hash FROM h1_register WHERE register_key = $1 AND entry_no = $2 AND NOT chain_legacy`,
      [chain.slice(3), prev.last_no]);
  const when = new Date(prev.recorded_at).toISOString();
  if (!row) return `Entry ${prev.last_no}, the end of this chain when it was checked at ${when}, is missing: the chain was cut short`;
  if (row.row_hash !== prev.head_hash) return `Entry ${prev.last_no} no longer has the hash recorded at ${when}: it was changed`;
  if (report.last_no !== null && report.last_no < prev.last_no) return `The chain now ends at ${report.last_no}, before entry ${prev.last_no} recorded at ${when}`;
  return null;
}

/**
 * Sprint 41 review #12: one chain check at a time (each walks every chain): a second request
 * while one runs is answered 409 instead of starting another walk.
 */
export async function runChainVerify(opts: { source: 'job' | 'manual'; userId?: string | null } = { source: 'job' }) {
  const lock = 'chain_verify:running';
  const r = getRedis();
  if ((await r.set(lock, opts.source, 'EX', 900, 'NX')) === null) {
    throw new AppError('A record-integrity check is already running; look again in a few minutes', 409, true, 'CHAIN_CHECK_RUNNING');
  }
  try { return await runChainVerifyOnce(opts); } finally { await r.del(lock); }
}

async function runChainVerifyOnce(opts: { source: 'job' | 'manual'; userId?: string | null }) {
  const keys = (await query<{ register_key: string }>(
    `SELECT DISTINCT register_key FROM h1_register WHERE register_key IS NOT NULL AND NOT chain_legacy
     UNION SELECT substr(chain, 4) FROM chain_heads WHERE chain LIKE 'h1:%' ORDER BY 1`)).map((r) => r.register_key);
  const results: ChainRunResult[] = [];
  const starts = await chainStarts();
  const check = async (chain: string, report: VerifyReport) => {
    const prevRow = await previousHead(chain);
    // A head recorded before the chain's start point (integrity.chain_start) is not compared
    const prev = prevRow && Number(prevRow.last_no) >= (starts[chain] ?? 1) - 1
      ? { last_no: Number(prevRow.last_no), head_hash: prevRow.head_hash, recorded_at: String(prevRow.recorded_at) } : null;
    const walkProblem = report.ok ? null : `${report.first_break?.problem ?? 'Chain broken'}${report.first_break?.no != null ? ` (entry ${report.first_break.no})` : ''}`;
    const problem = walkProblem ?? await headProblem(chain, prev, report);
    const r: ChainRunResult = { chain, from: starts[chain] ?? 1, ok: !problem, checked: report.checked, last_no: report.last_no, head_hash: report.head_hash, problem, previous_head: prev };
    await query(
      `INSERT INTO chain_heads (chain, last_no, head_hash, checked, ok, problem, source, recorded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [chain, r.last_no, r.head_hash, r.checked, r.ok, r.problem, opts.source, opts.userId ?? null]);
    results.push(r);
  };
  await check('audit', await verifyAuditChain({ from: starts.audit }));
  for (const k of keys) await check(`h1:${k}`, await verifyH1Register(k, { from: starts[`h1:${k}`] }));
  const broken = results.filter((r) => !r.ok);
  if (broken.length) {
    const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active AND deleted_at IS NULL`);
    const text = `Record integrity check found ${broken.length} broken chain(s): ${broken.map((b) => `${b.chain} — ${b.problem}`).join('; ').slice(0, 900)}. `
      + 'Open Admin → Record integrity, keep the database as it is and follow RUNBOOK §6 (chain break).';
    for (const a of admins) await queueNotification({ userId: a.id, type: 'chain_break', text });
  }
  await writeAudit({ userId: null, action: 'chain_verify_run', performedBy: opts.userId ?? null,
    newValue: { source: opts.source, chains: results.length, broken: broken.map((b) => b.chain) } });
  return { ok: !broken.length, chains: results.length, broken: broken.length, results };
}

/** The latest recorded head of every chain, and when the job last ran. */
export async function latestHeads() {
  const heads = await query<any>(
    `SELECT DISTINCT ON (chain) chain, last_no::text AS last_no, head_hash, checked, ok, problem, source, recorded_at
     FROM chain_heads ORDER BY chain, recorded_at DESC`);
  const lastRun = await queryOne<any>(
    `SELECT status, started_at, finished_at, summary, error FROM job_runs WHERE job_name = 'chain_verify' ORDER BY started_at DESC LIMIT 1`);
  return { heads: heads.map((h) => ({ ...h, last_no: h.last_no === null ? null : Number(h.last_no) })), last_job_run: lastRun ?? null,
    chain_start: await chainStarts() };
}
