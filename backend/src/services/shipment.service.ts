// src/services/shipment.service.ts
// Splits an order into one shipment per seller of record (Rulebook C-05).
//
// Sprint 44 (owner decision CONFIRMED 2026-10-03): a shipment no longer takes its
// invoice number here. The seller's gap-free tax-invoice number (C-30; Dawabag's series
// 'DWB', a partner's with the prefix set at approval) is issued when a registered
// pharmacist releases the shipment (database trigger order_shipments_issue_invoice,
// migration 39). Until then the shipment's lines and amounts follow the buyer's changes
// (services/orderEdit) and are re-priced here; once invoiced they are final.
import { PoolClient } from 'pg';
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
  seller_name: string;
  partner_id: string | null;
  /** null until the pharmacist releases the shipment (Sprint 44) */
  invoice_number: string | null;
  total_paise: number;
}

/** A line's amounts: GST on the assessable value, split CGST + SGST (intra-state) or IGST. */
export function lineAmounts(unitPricePaise: number, quantity: number, gstRate: number, interState: boolean) {
  const assessable = unitPricePaise * quantity;
  const gst = Math.round(assessable * gstRate / 100);
  const half = interState ? 0 : Math.round(gst / 2);
  return {
    assessable, gst, total: assessable + gst,
    cgst: half, sgst: interState ? 0 : gst - half, igst: interState ? gst : 0,
  };
}

async function buyerStateOf(client: PoolClient, orderId: string): Promise<string | null> {
  return (await client.query(
    `SELECT a.state FROM orders o JOIN addresses a ON a.id = o.address_id WHERE o.id = $1`, [orderId])).rows[0]?.state ?? null;
}

/** Is a sale by this seller to this order's delivery address inter-state (IGST)? */
export async function isInterState(client: PoolClient, orderId: string, seller: { seller_type: string; partner_id: string | null }): Promise<boolean> {
  return !sameState(await sellerState(client, seller), await buyerStateOf(client, orderId));
}

/**
 * The seller's shipment for this order that is not invoiced yet (re-opened if every line had
 * been taken off), or a new one. One shipment per seller of record (C-05).
 */
async function openShipmentTx(client: PoolClient, orderId: string, alloc: Allocation): Promise<string> {
  const existing = (await client.query(
    `SELECT id, status FROM order_shipments
     WHERE order_id = $1 AND seller_type = $2 AND partner_id IS NOT DISTINCT FROM $3 AND invoice_number IS NULL
       AND status IN ('pending', 'cancelled') AND pharmacist_check IN ('pending', 'held')
     ORDER BY (status = 'pending') DESC, created_at LIMIT 1 FOR UPDATE`,
    [orderId, alloc.seller_type, alloc.partner_id])).rows[0];
  if (existing) {
    if (existing.status === 'cancelled') {
      await client.query(`UPDATE order_shipments SET status = 'pending', pharmacist_check = 'pending' WHERE id = $1`, [existing.id]);
    }
    return existing.id;
  }
  return (await client.query(
    `INSERT INTO order_shipments (order_id, seller_type, partner_id, invoice_number, subtotal_paise, gst_paise, total_paise, cold_chain, allocation_note)
     VALUES ($1, $2, $3, NULL, 0, 0, 0, FALSE, $4) RETURNING id`,
    [orderId, alloc.seller_type, alloc.partner_id, alloc.note.slice(0, 2000)])).rows[0].id;
}

/** One order line (and the partner's line of record) on the seller's shipment. Returns the order item id. */
export async function insertLineTx(client: PoolClient, orderId: string, shipmentId: string, line: PricedLine, alloc: Allocation, interState: boolean): Promise<string> {
  const a = lineAmounts(line.unit_price_paise, line.quantity, line.gst_rate, interState);
  const item = (await client.query(
    `INSERT INTO order_items (
       order_id, shipment_id, product_id, batch_id, product_name, sku,
       quantity, unit_price_paise, mrp_paise, gst_rate,
       cgst_paise, sgst_paise, igst_paise, gst_amount_paise, line_total_paise
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [orderId, shipmentId, line.product_id, alloc.batch_id, line.product_name, line.sku,
     line.quantity, line.unit_price_paise, line.mrp_paise, line.gst_rate,
     a.cgst, a.sgst, a.igst, a.gst, a.total])).rows[0];
  if (alloc.seller_type === 'partner') {
    // Commission and fees are computed at settlement from the partner's rates
    await client.query(
      `INSERT INTO partner_order_items
         (order_id, order_item_id, shipment_id, partner_id, partner_product_id, partner_inv_id,
          allocated_qty, line_value_paise, line_gst_paise, allocation_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [orderId, item.id, shipmentId, alloc.partner_id, alloc.partner_product_id, alloc.partner_inventory_id,
       line.quantity, a.assessable, a.gst, alloc.note.slice(0, 200)]);
  }
  return item.id;
}

/**
 * The shipment amounts from its lines, while it is not invoiced (Sprint 44). A shipment
 * left with nothing to supply is cancelled (with its partner lines): its parcel is never made.
 */
export async function repriceShipmentsTx(client: PoolClient, shipmentIds: string[]): Promise<void> {
  for (const id of [...new Set(shipmentIds)]) {
    const t = (await client.query(
      `SELECT COALESCE(SUM(oi.unit_price_paise * oi.supply_qty), 0)::int AS subtotal,
              COALESCE(SUM(oi.gst_amount_paise), 0)::int AS gst, COALESCE(SUM(oi.supply_qty), 0)::int AS units,
              COALESCE(BOOL_OR(p.cold_chain), FALSE) AS cold_chain
       FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.shipment_id = $1`, [id])).rows[0];
    if (Number(t.units) === 0) {
      await client.query(`UPDATE partner_order_items SET dispatch_status = 'cancelled' WHERE shipment_id = $1 AND dispatch_status = 'pending'`, [id]);
      await client.query(
        `UPDATE order_shipments SET status = 'cancelled', subtotal_paise = 0, gst_paise = 0, total_paise = 0
         WHERE id = $1 AND invoice_number IS NULL AND status = 'pending'`, [id]);
      continue;
    }
    await client.query(
      `UPDATE order_shipments SET subtotal_paise = $2, gst_paise = $3, total_paise = $4, cold_chain = $5
       WHERE id = $1 AND invoice_number IS NULL`, [id, t.subtotal, t.gst, Number(t.subtotal) + Number(t.gst), t.cold_chain]);
  }
}

/**
 * Lines of an order on their sellers' shipments (order placement, and lines a buyer adds
 * before the invoice). Dawabag's shipment first, so the response lists it first.
 */
export async function placeLinesTx(
  client: PoolClient, orderId: string, lines: PricedLine[], allocations: Allocation[]
): Promise<CreatedShipment[]> {
  const groups = new Map<string, { alloc: Allocation; lines: { line: PricedLine; alloc: Allocation }[] }>();
  lines.forEach((line, i) => {
    const alloc = allocations[i];
    const key = alloc.seller_type === 'dawabag' ? 'dawabag' : `partner:${alloc.partner_id}`;
    if (!groups.has(key)) groups.set(key, { alloc, lines: [] });
    groups.get(key)!.lines.push({ line, alloc });
  });
  const isOwn = (g: { alloc: Allocation }) => Number(g.alloc.seller_type === 'dawabag');
  const ordered = [...groups.values()].sort((a, b) => isOwn(b) - isOwn(a));
  const out: CreatedShipment[] = [];
  for (const group of ordered) {
    const shipmentId = await openShipmentTx(client, orderId, group.alloc);
    const interState = await isInterState(client, orderId, group.alloc);
    for (const { line, alloc } of group.lines) await insertLineTx(client, orderId, shipmentId, line, alloc, interState);
    await repriceShipmentsTx(client, [shipmentId]);
    const s = (await client.query(
      `SELECT s.id, s.seller_type, s.partner_id, s.invoice_number, s.total_paise, COALESCE(v.name, 'Dawabag') AS seller_name
       FROM order_shipments s LEFT JOIN vendors v ON v.id = s.partner_id WHERE s.id = $1`, [shipmentId])).rows[0];
    out.push({ id: s.id, seller_type: s.seller_type, seller_name: s.seller_type === 'dawabag' ? 'Dawabag' : (s.seller_name ?? 'Partner pharmacy'),
      partner_id: s.partner_id, invoice_number: s.invoice_number, total_paise: Number(s.total_paise) });
  }
  return out;
}

/** Order placement: every line on its seller's shipment (no invoice yet — Sprint 44). */
export const createShipmentsAndLines = placeLinesTx;

// Frees the stock an order reserved (own batches and partner batches) and
// cancels its shipments. Call once, when the order is cancelled.
export async function releaseOrderReservations(client: PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE inventory_batches b SET quantity_reserved = GREATEST(b.quantity_reserved - oi.supply_qty, 0)
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

export async function sellerState(client: PoolClient, alloc: { seller_type: string; partner_id: string | null }): Promise<string | null> {
  if (alloc.seller_type === 'partner') {
    return (await client.query('SELECT state FROM vendors WHERE id = $1', [alloc.partner_id])).rows[0]?.state ?? null;
  }
  const entity = (await client.query(`SELECT value FROM app_settings WHERE key = 'legal.entity'`)).rows[0]?.value;
  return entity?.state || 'Maharashtra';
}

// Unknown states are treated as intra-state (the common case here); the
// invoice shows the states so an error is visible.
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  const norm = (x: string) => x.trim().toLowerCase().replace(/[^a-z]/g, '');
  const aliases: Record<string, string> = { mh: 'maharashtra', ka: 'karnataka', gj: 'gujarat', dl: 'delhi', tn: 'tamilnadu' };
  const n = (x: string) => aliases[norm(x)] ?? norm(x);
  return n(a) === n(b);
}
