// Cycle counts: snapshot the system quantity, record what is on the shelf, and on
// approval by a second person turn each difference into an approved adjustment.
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { applyAdjustment, createAdjustment } from './adjustment.service';

export async function startCount(userId: string, scope: { label: string; product_ids?: string[]; storage_location?: string }) {
  return withTransaction(async (client) => {
    const where = ['b.quantity_available > 0'];
    const params: unknown[] = [];
    if (scope.product_ids?.length) { params.push(scope.product_ids); where.push(`b.product_id = ANY($${params.length}::uuid[])`); }
    if (scope.storage_location) { params.push(`${scope.storage_location}%`); where.push(`b.storage_location ILIKE $${params.length}`); }
    const batches = (await client.query(`SELECT b.id, b.quantity_available FROM inventory_batches b WHERE ${where.join(' AND ')} LIMIT 2000`, params)).rows;
    if (!batches.length) throw new AppError('No stock matches this count', 400);
    const n = (await client.query(`SELECT nextval('stock_count_seq') AS n`)).rows[0].n;
    const no = `CNT-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`;
    const c = (await client.query(`INSERT INTO stock_counts (count_no, scope, counted_by) VALUES ($1, $2, $3) RETURNING id, count_no, status`,
      [no, scope.label, userId])).rows[0];
    for (const b of batches) {
      await client.query(`INSERT INTO stock_count_lines (stock_count_id, batch_id, system_qty) VALUES ($1, $2, $3)`, [c.id, b.id, b.quantity_available]);
    }
    return { ...c, lines: batches.length };
  });
}

export async function recordCounts(userId: string, id: string, lines: { batch_id: string; counted_qty: number }[]) {
  return withTransaction(async (client) => {
    const c = (await client.query(`SELECT status, counted_by FROM stock_counts WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!c) throw new AppError('Count not found', 404);
    if (c.status !== 'open') throw new AppError(`Count is ${c.status}`, 409);
    if (c.counted_by !== userId) throw new AppError('Only the person who started the count records it', 403);
    for (const l of lines) {
      const r = await client.query(`UPDATE stock_count_lines SET counted_qty = $3 WHERE stock_count_id = $1 AND batch_id = $2`, [id, l.batch_id, l.counted_qty]);
      if (!r.rowCount) throw new AppError('A batch is not part of this count', 400);
    }
    return { id, recorded: lines.length };
  });
}

export async function submitCount(userId: string, id: string) {
  return withTransaction(async (client) => {
    const c = (await client.query(`SELECT status, counted_by FROM stock_counts WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!c) throw new AppError('Count not found', 404);
    if (c.status !== 'open' || c.counted_by !== userId) throw new AppError('Only the counter can submit an open count', 409);
    const missing = (await client.query(`SELECT COUNT(*)::int AS n FROM stock_count_lines WHERE stock_count_id = $1 AND counted_qty IS NULL`, [id])).rows[0].n;
    if (missing) throw new AppError(`${missing} batch(es) not counted yet`, 400);
    await client.query(`UPDATE stock_counts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`, [id]);
    return { id, status: 'submitted' };
  });
}

export async function approveCount(approverId: string, id: string) {
  return withTransaction(async (client) => {
    const c = (await client.query(`SELECT * FROM stock_counts WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!c) throw new AppError('Count not found', 404);
    if (c.status !== 'submitted') throw new AppError(`Count is ${c.status}`, 409);
    if (c.counted_by === approverId) throw new AppError('Someone other than the counter must approve', 403);
    // The variance is counted against the stock at the start of the count; if sales,
    // receipts or adjustments moved a batch since, that variance is no longer true
    const moved = (await client.query(
      `SELECT p.name, b.batch_number FROM stock_count_lines l JOIN inventory_batches b ON b.id = l.batch_id JOIN products p ON p.id = b.product_id
       WHERE l.stock_count_id = $1 AND b.quantity_available <> l.system_qty FOR UPDATE OF b`, [id])).rows;
    if (moved.length) {
      throw new AppError(`Stock moved during the count for ${moved.map((m: any) => `${m.name} ${m.batch_number}`).join(', ')}; start a new count for these batches`, 409);
    }
    const diffs = (await client.query(
      `SELECT batch_id, counted_qty - system_qty AS delta FROM stock_count_lines WHERE stock_count_id = $1 AND counted_qty <> system_qty`, [id])).rows;
    for (const d of diffs) {
      const adj = await createAdjustment(client, c.counted_by, { batch_id: d.batch_id, quantity_delta: d.delta, reason: 'count_variance',
        notes: `Stock count ${c.count_no}`, stock_count_id: id });
      await applyAdjustment(client, approverId, adj.id, `Approved with count ${c.count_no}`);
    }
    await client.query(`UPDATE stock_counts SET status = 'approved', approved_by = $2, approved_at = NOW() WHERE id = $1`, [id, approverId]);
    await writeAuditTx(client, { userId: null, action: 'stock_count_approved', performedBy: approverId, newValue: { count_id: id, variances: diffs.length } });
    return { id, status: 'approved', variances: diffs.length };
  });
}

// Blind count: the counter does not see the system quantity until the count is submitted
export async function getCount(id: string, viewer?: { id: string; role: string }) {
  const c = await queryOne<any>(
    `SELECT c.*, cu.full_name AS counted_by_name, au.full_name AS approved_by_name FROM stock_counts c
     LEFT JOIN user_profiles cu ON cu.user_id = c.counted_by LEFT JOIN user_profiles au ON au.user_id = c.approved_by WHERE c.id = $1`, [id]);
  if (!c) throw new AppError('Count not found', 404);
  const lines = await query(
    `SELECT l.batch_id, b.batch_number, b.expiry_date, b.storage_location, p.name AS product_name, p.sku, l.system_qty, l.counted_qty
     FROM stock_count_lines l JOIN inventory_batches b ON b.id = l.batch_id JOIN products p ON p.id = b.product_id
     WHERE l.stock_count_id = $1 ORDER BY b.storage_location NULLS LAST, p.name`, [id]);
  const blind = c.status === 'open' && viewer && !['admin', 'super_admin'].includes(viewer.role);
  return { ...c, lines: blind ? lines.map(({ system_qty, ...l }: any) => l) : lines };
}

export async function listCounts() {
  return query(
    `SELECT c.*, cu.full_name AS counted_by_name, au.full_name AS approved_by_name,
            (SELECT COUNT(*)::int FROM stock_count_lines l WHERE l.stock_count_id = c.id) AS lines
     FROM stock_counts c LEFT JOIN user_profiles cu ON cu.user_id = c.counted_by LEFT JOIN user_profiles au ON au.user_id = c.approved_by
     ORDER BY c.created_at DESC LIMIT 100`);
}
