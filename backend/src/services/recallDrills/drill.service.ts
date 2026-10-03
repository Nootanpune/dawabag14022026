// Mock recall drills (Sprint 40; handover O15; Rulebook C-28 recall readiness, C-34 records).
// An admin picks a batch (Dawabag's or a partner's); the system runs the REAL trace
// (recall/trace.ts — the same queries a recall uses) and records when the drill started,
// how long the trace took, and what it found: orders, shipments, buyers, partners
// involved, H1 register entries and stock on hand by location. Nothing is changed and
// NOBODY is contacted: no buyer or partner notification, no batch blocked. The record is
// final once traced (database trigger); an admin closes it once with the conclusion.
import { getDB, query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { istYear } from '../../utils/ist';
import { traceBatch, traceSummary } from '../recall/trace';

export interface DrillInput { product_id: string; batch_number: string; scenario: string }

export async function startDrill(adminId: string, input: DrillInput) {
  const startedAt = new Date();
  const product = await queryOne<{ id: string; name: string }>(`SELECT id, name FROM products WHERE id = $1`, [input.product_id]);
  if (!product) throw new AppError('Product not found', 404);
  const batch = input.batch_number.trim();
  // The trace itself: read-only, one consistent snapshot
  const client = await getDB().connect();
  let trace;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    trace = await traceBatch(client, product.id, batch);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  const tracedAt = new Date();
  if (!trace.lines.length && !trace.stock.length && !trace.h1_entries.length) {
    throw new AppError(`No batch ${batch} of ${product.name} was found in Dawabag's or any partner's stock or sales`, 404);
  }
  const summary = traceSummary(trace);
  const ms = Math.max(0, tracedAt.getTime() - startedAt.getTime());
  return withTransaction(async (c) => {
    const n = (await c.query(`SELECT nextval('recall_drill_seq') AS n`)).rows[0].n;
    const drillNo = `DRILL-${istYear()}-${String(n).padStart(4, '0')}`;
    const row = (await c.query(
      `INSERT INTO recall_drills (drill_no, product_id, batch_number, scenario, started_by, started_at, traced_at, time_to_trace_ms, summary, findings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, drill_no, started_at, traced_at, time_to_trace_ms`,
      [drillNo, product.id, batch, input.scenario.trim(), adminId, startedAt, tracedAt, ms, JSON.stringify(summary), JSON.stringify(trace)])).rows[0];
    await writeAuditTx(c, { userId: null, action: 'recall_drill_run', performedBy: adminId,
      newValue: { drill_id: row.id, drill_no: drillNo, product_id: product.id, batch_number: batch, time_to_trace_ms: ms, ...summary },
      notes: 'Mock recall drill: trace only, nobody contacted (C-28)' });
    return { ...row, product_name: product.name, batch_number: batch, summary, buyers_contacted: false };
  });
}

export async function listDrills() {
  return query<any>(
    `SELECT d.id, d.drill_no, d.batch_number, d.scenario, d.started_at, d.time_to_trace_ms, d.summary, d.closed_at,
            p.name AS product_name, p.sku, up.full_name AS started_by_name
     FROM recall_drills d JOIN products p ON p.id = d.product_id LEFT JOIN user_profiles up ON up.user_id = d.started_by
     ORDER BY d.started_at DESC LIMIT 200`);
}

export async function getDrill(id: string) {
  const d = await queryOne<any>(
    `SELECT d.*, p.name AS product_name, p.sku, p.drug_schedule, up.full_name AS started_by_name, cu.full_name AS closed_by_name
     FROM recall_drills d JOIN products p ON p.id = d.product_id
     LEFT JOIN user_profiles up ON up.user_id = d.started_by LEFT JOIN user_profiles cu ON cu.user_id = d.closed_by
     WHERE d.id = $1`, [id]);
  if (!d) throw new AppError('Drill not found', 404);
  return d;
}

export async function closeDrill(adminId: string, id: string, conclusion: string, actions: string | null) {
  return withTransaction(async (c) => {
    const d = (await c.query(`SELECT id, closed_at FROM recall_drills WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!d) throw new AppError('Drill not found', 404);
    if (d.closed_at) throw new AppError('This drill is already closed', 409);
    await c.query(`UPDATE recall_drills SET conclusion = $2, actions = $3, closed_by = $4, closed_at = NOW() WHERE id = $1`,
      [id, conclusion.trim(), actions?.trim() || null, adminId]);
    await writeAuditTx(c, { userId: null, action: 'recall_drill_closed', performedBy: adminId, newValue: { drill_id: id }, notes: conclusion.trim() });
    return { id, closed: true };
  });
}

/** Products and batch numbers a drill can trace (Dawabag's and partners' batches). */
export async function drillableBatches(q: string | undefined) {
  const params: unknown[] = [];
  let where = '';
  if (q?.trim()) { params.push(`%${q.trim()}%`); where = `WHERE x.product_name ILIKE $1 OR x.sku ILIKE $1 OR x.batch_number ILIKE $1`; }
  return query<any>(
    `SELECT x.product_id, x.product_name, x.sku, x.batch_number, bool_or(x.holder = 'dawabag') AS at_dawabag,
            COUNT(*) FILTER (WHERE x.holder = 'partner')::int AS partner_batches
     FROM (SELECT ib.product_id, p.name AS product_name, p.sku, ib.batch_number, 'dawabag' AS holder
           FROM inventory_batches ib JOIN products p ON p.id = ib.product_id
           UNION ALL
           SELECT pp.product_id, p.name, p.sku, pi.batch_number, 'partner'
           FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id JOIN products p ON p.id = pp.product_id) x
     ${where}
     GROUP BY x.product_id, x.product_name, x.sku, x.batch_number ORDER BY x.product_name, x.batch_number LIMIT 50`, params);
}
