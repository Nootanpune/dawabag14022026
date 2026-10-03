// Packing and dispatch guard (Sprint 40, C-25): no line of the shipment may come from a
// batch on GDP hold (cold-chain excursion waiting for a pharmacist, quarantined or to be
// destroyed). Lines reserved before the excursion wait here until the pharmacist releases
// the batch — or staff cancel / re-pick them.
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';

export async function assertNoGdpHeldLines(client: Pick<PoolClient, 'query'>, shipmentId: string): Promise<void> {
  const bad = (await client.query(
    `SELECT oi.product_name, COALESCE(ib.batch_number, pi.batch_number) AS batch_number, COALESCE(ib.gdp_status, pi.gdp_status) AS gdp_status
     FROM order_items oi
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     WHERE oi.shipment_id = $1 AND (ib.gdp_status <> 'ok' OR pi.gdp_status <> 'ok')`, [shipmentId])).rows;
  if (bad.length) {
    throw new AppError(`Batch on GDP hold in this shipment: ${bad.map((b: any) => `${b.product_name} (${b.batch_number}, ${String(b.gdp_status).replace('_', ' ')})`).join(', ')}. `
      + 'A pharmacist must decide on the cold-chain excursion first (Staff → GDP excursions), or cancel / re-pick the line (C-25).', 409, true, 'GDP_HOLD');
  }
}
