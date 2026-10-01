// src/services/recall.service.ts — batch recalls (Rulebook C-28)
// A recall marks every Dawabag and partner batch with that number as recalled,
// which takes it out of search stock, carts and allocation, blocks packing and
// dispatch of lines already reserved from it, and notifies every buyer who
// received or is waiting for it.
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { queueNotification } from './notification.service';

// Order lines supplied (or reserved) from a recalled batch
const AFFECTED_SQL = `
  SELECT DISTINCT o.id AS order_id, o.order_number, o.user_id, o.status AS order_status,
         oi.id AS order_item_id, oi.quantity, s.status AS shipment_status, s.seller_type,
         up.full_name AS buyer_name
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  LEFT JOIN order_shipments s ON s.id = oi.shipment_id
  LEFT JOIN user_profiles up ON up.user_id = o.user_id
  LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
  LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
  LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
  WHERE oi.product_id = $1 AND o.status <> 'cancelled'
    AND (ib.batch_number = $2 OR pi.batch_number = $2)`;

export interface RecallInput { product_id: string; batch_number: string; reason: string; source?: string }

export async function recallBatch(staffId: string, input: RecallInput) {
  return withTransaction((client) => recallBatchTx(client, staffId, input));
}

// Inside the caller's transaction (a recall decided from a regulator alert, recallAlerts/)
export async function recallBatchTx(client: PoolClient, staffId: string, input: RecallInput) {
  {
    const product = (await client.query('SELECT id, name FROM products WHERE id = $1', [input.product_id])).rows[0];
    if (!product) throw new AppError('Product not found', 404);
    const recall = (await client.query(
      `INSERT INTO batch_recalls (product_id, batch_number, reason, source, recalled_by)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (product_id, batch_number) DO NOTHING RETURNING id, recalled_at`,
      [input.product_id, input.batch_number, input.reason, input.source || null, staffId])).rows[0];
    if (!recall) throw new AppError('This batch is already recalled', 409);

    const own = await client.query(
      `UPDATE inventory_batches SET is_recalled = TRUE WHERE product_id = $1 AND batch_number = $2`,
      [input.product_id, input.batch_number]);
    const partner = await client.query(
      `UPDATE partner_inventory pi SET is_recalled = TRUE FROM partner_products pp
       WHERE pp.id = pi.partner_product_id AND pp.product_id = $1 AND pi.batch_number = $2`,
      [input.product_id, input.batch_number]);

    const affected = (await client.query(AFFECTED_SQL, [input.product_id, input.batch_number])).rows;
    const orders = new Map<string, any>();
    for (const a of affected) orders.set(a.order_id, a);
    for (const o of orders.values()) {
      await queueNotification({ userId: o.user_id, type: 'batch_recall', orderId: o.order_id, orderNumber: o.order_number,
        productName: product.name, batchNumber: input.batch_number, reason: input.reason });
    }
    await writeAuditTx(client, { userId: null, action: 'batch_recalled', performedBy: staffId,
      newValue: { recall_id: recall.id, product_id: input.product_id, batch_number: input.batch_number,
        own_batches: own.rowCount, partner_batches: partner.rowCount, orders_notified: orders.size },
      notes: input.reason });
    return {
      id: recall.id, product_name: product.name, batch_number: input.batch_number,
      own_batches: own.rowCount, partner_batches: partner.rowCount, orders_notified: orders.size,
      awaiting_dispatch: affected.filter((a) => !a.shipment_status || ['pending', 'packed'].includes(a.shipment_status)).length,
    };
  }
}

export async function listRecalls() {
  return query(
    `SELECT r.id, r.product_id, p.name AS product_name, r.batch_number, r.reason, r.source, r.recalled_at,
            up.full_name AS recalled_by_name
     FROM batch_recalls r JOIN products p ON p.id = r.product_id
     LEFT JOIN user_profiles up ON up.user_id = r.recalled_by
     ORDER BY r.recalled_at DESC LIMIT 200`);
}

export async function getRecall(id: string) {
  const r = await queryOne<any>(
    `SELECT r.*, p.name AS product_name, up.full_name AS recalled_by_name FROM batch_recalls r
     JOIN products p ON p.id = r.product_id LEFT JOIN user_profiles up ON up.user_id = r.recalled_by WHERE r.id = $1`, [id]);
  if (!r) throw new AppError('Recall not found', 404);
  const affected = await query(AFFECTED_SQL, [r.product_id, r.batch_number]);
  return { ...r, affected };
}

// Packing/dispatch guard: no line of the shipment may come from a recalled batch
export async function assertNoRecalledLines(client: PoolClient, shipmentId: string): Promise<void> {
  const bad = (await client.query(
    `SELECT oi.product_name, COALESCE(ib.batch_number, pi.batch_number) AS batch_number
     FROM order_items oi
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     WHERE oi.shipment_id = $1 AND (ib.is_recalled OR pi.is_recalled)`, [shipmentId])).rows;
  if (bad.length) {
    throw new AppError(`Recalled batch in this shipment: ${bad.map((b) => `${b.product_name} (${b.batch_number})`).join(', ')}. Cancel or re-pick it.`, 409);
  }
}
