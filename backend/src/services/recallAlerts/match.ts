// Which of our products carry a batch on a regulator list: Dawabag batches and
// partner batches, held now or supplied on orders before (C-28). Matching is on the
// batch key only — the admin sees the drug name from the list beside our product
// and recalls it or clears it with a note.
import { PoolClient } from 'pg';
import { batchKeySql } from './batchKey';

export interface BatchMatch { batch_key: string; product_id: string; product_name: string; batch_numbers: string[]; units_held: number; units_sold: number }

export async function findBatchMatches(client: PoolClient, keys: string[]): Promise<BatchMatch[]> {
  if (!keys.length) return [];
  const r = await client.query(
    `WITH held AS (
       SELECT ${batchKeySql('b.batch_number')} AS batch_key, b.product_id, b.batch_number, b.quantity_available AS held,
              (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                WHERE oi.batch_id = b.id AND o.status <> 'cancelled') AS sold
       FROM inventory_batches b WHERE ${batchKeySql('b.batch_number')} = ANY($1)
       UNION ALL
       SELECT ${batchKeySql('pi.batch_number')}, pp.product_id, pi.batch_number, pi.qty_available,
              (SELECT COALESCE(SUM(poi.allocated_qty), 0) FROM partner_order_items poi JOIN orders o ON o.id = poi.order_id
                WHERE poi.partner_inv_id = pi.id AND o.status <> 'cancelled')
       FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id
       WHERE ${batchKeySql('pi.batch_number')} = ANY($1))
     SELECT h.batch_key, h.product_id, p.name AS product_name, array_agg(DISTINCT h.batch_number) AS batch_numbers,
            SUM(h.held)::int AS units_held, SUM(h.sold)::int AS units_sold
     FROM held h JOIN products p ON p.id = h.product_id
     GROUP BY h.batch_key, h.product_id, p.name`, [keys]);
  return r.rows;
}
