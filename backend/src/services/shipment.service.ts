// src/services/shipment.service.ts
// Splits an order into one shipment per seller of record. Each shipment gets
// its seller's own gap-free invoice number (Rulebook C-05, C-30): Dawabag's
// series 'DWB', or the partner's series with the prefix set at approval.
import { PoolClient } from 'pg';
import { AppError } from '../utils/AppError';
import { Allocation } from './allocation.service';

export interface PricedLine {
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price_paise: number;
  mrp_paise: number;
  gst_rate: number;
  gst_amount_paise: number;
  assessable_paise: number;
  line_total_paise: number;
  cold_chain: boolean;
}

export interface CreatedShipment {
  id: string;
  seller_type: 'dawabag' | 'partner';
  partner_id: string | null;
  invoice_number: string;
  total_paise: number;
}

export async function createShipmentsAndLines(
  client: PoolClient, orderId: string, lines: PricedLine[], allocations: Allocation[]
): Promise<CreatedShipment[]> {
  const groups = new Map<string, { alloc: Allocation; lines: { line: PricedLine; alloc: Allocation }[] }>();
  lines.forEach((line, i) => {
    const alloc = allocations[i];
    const key = alloc.seller_type === 'dawabag' ? 'dawabag' : `partner:${alloc.partner_id}`;
    if (!groups.has(key)) groups.set(key, { alloc, lines: [] });
    groups.get(key)!.lines.push({ line, alloc });
  });

  const shipments: CreatedShipment[] = [];
  // Dawabag first so its invoice is stable/predictable in the response
  const isOwn = (g: { alloc: Allocation }) => Number(g.alloc.seller_type === 'dawabag');
  const ordered = [...groups.values()].sort((a, b) => isOwn(b) - isOwn(a));
  for (const group of ordered) {
    const invoice = await nextInvoiceNumber(client, group.alloc);
    const subtotal = group.lines.reduce((s, l) => s + l.line.assessable_paise, 0);
    const gst = group.lines.reduce((s, l) => s + l.line.gst_amount_paise, 0);
    const shipment = (await client.query(
      `INSERT INTO order_shipments
         (order_id, seller_type, partner_id, invoice_number, subtotal_paise, gst_paise, total_paise, cold_chain, allocation_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [orderId, group.alloc.seller_type, group.alloc.partner_id, invoice, subtotal, gst, subtotal + gst,
       group.lines.some((l) => l.line.cold_chain), group.lines.map((l) => l.alloc.note).join(' | ').slice(0, 2000)]
    )).rows[0];

    for (const { line, alloc } of group.lines) {
      const halfGst = Math.round(line.gst_amount_paise / 2);
      const item = (await client.query(
        `INSERT INTO order_items (
           order_id, shipment_id, product_id, batch_id, product_name, sku,
           quantity, unit_price_paise, mrp_paise, gst_rate,
           cgst_paise, sgst_paise, igst_paise, gst_amount_paise, line_total_paise
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [orderId, shipment.id, line.product_id, alloc.batch_id, line.product_name, line.sku,
         line.quantity, line.unit_price_paise, line.mrp_paise, line.gst_rate,
         halfGst, line.gst_amount_paise - halfGst, 0, line.gst_amount_paise, line.line_total_paise]
      )).rows[0];

      if (alloc.seller_type === 'partner') {
        // Commission and fees are computed at settlement from the partner's rates
        await client.query(
          `INSERT INTO partner_order_items
             (order_id, order_item_id, shipment_id, partner_id, partner_product_id, partner_inv_id,
              allocated_qty, line_value_paise, line_gst_paise, allocation_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [orderId, item.id, shipment.id, alloc.partner_id, alloc.partner_product_id, alloc.partner_inventory_id,
           line.quantity, line.assessable_paise, line.gst_amount_paise, alloc.note.slice(0, 200)]
        );
      }
    }

    shipments.push({
      id: shipment.id, seller_type: group.alloc.seller_type, partner_id: group.alloc.partner_id,
      invoice_number: invoice, total_paise: subtotal + gst,
    });
  }
  return shipments;
}

async function nextInvoiceNumber(client: PoolClient, alloc: Allocation): Promise<string> {
  if (alloc.seller_type === 'dawabag') {
    return (await client.query(`SELECT next_invoice_number('DWB', 'DWB') AS n`)).rows[0].n;
  }
  const v = (await client.query('SELECT invoice_prefix FROM vendors WHERE id = $1', [alloc.partner_id])).rows[0];
  if (!v?.invoice_prefix) throw new AppError('Partner invoice series is not set up; contact support', 500);
  return (await client.query(`SELECT next_invoice_number($1, $2) AS n`, [`P:${alloc.partner_id}`, v.invoice_prefix])).rows[0].n;
}

// Frees the stock an order reserved (own batches and partner batches) and
// cancels its shipments. Call once, when the order is cancelled.
export async function releaseOrderReservations(client: PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE inventory_batches b SET quantity_reserved = GREATEST(b.quantity_reserved - oi.quantity, 0)
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.batch_id = b.id`,
    [orderId]
  );
  await client.query(
    `UPDATE partner_inventory pi SET qty_reserved = GREATEST(pi.qty_reserved - poi.allocated_qty, 0), last_updated_at = NOW()
     FROM partner_order_items poi
     WHERE poi.order_id = $1 AND poi.partner_inv_id = pi.id AND poi.dispatch_status = 'pending'`,
    [orderId]
  );
  await client.query(
    `UPDATE partner_order_items SET dispatch_status = 'cancelled' WHERE order_id = $1 AND dispatch_status = 'pending'`,
    [orderId]
  );
  await client.query(
    `UPDATE order_shipments SET status = 'cancelled' WHERE order_id = $1 AND status IN ('pending', 'packed')`,
    [orderId]
  );
}
