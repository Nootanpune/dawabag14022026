// Applying an order change to the order's lines before the invoice (Sprint 44; rules.ts).
// Nothing is invoiced yet, so a line is rewritten (quantity and amounts), removed, or added;
// stock reservations follow (Dawabag's batches and the partner's own ledger); raised and
// added units are allocated again and may go to another seller (another shipment, C-05).
// The database refuses any of this once the shipment is invoiced (migration 39).
import { PoolClient } from 'pg';
import { Allocation, allocateAndReserve } from '../allocation.service';
import { SaleKind } from '../stock/sellingRights';
import { PricedLine, isInterState, lineAmounts, placeLinesTx } from '../shipment.service';

export interface OrderLine {
  order_item_id: string;
  shipment_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  supply_qty: number;
  unit_price_paise: number;
  mrp_paise: number;
  gst_rate: number;
  batch_id: string | null;
  cold_chain: boolean;
  drug_schedule: string;
  prescription_id: string | null;
  seller_type: 'dawabag' | 'partner';
  partner_id: string | null;
  partner_inv_id: string | null;
}

/** The order's lines still to be supplied, with their seller and batch. */
export async function orderLinesTx(client: PoolClient, orderId: string): Promise<OrderLine[]> {
  return (await client.query(
    `SELECT oi.id AS order_item_id, oi.shipment_id, oi.product_id, oi.product_name, oi.sku, oi.quantity, oi.supply_qty,
            oi.unit_price_paise, oi.mrp_paise, oi.gst_rate, oi.batch_id, p.cold_chain, p.drug_schedule, oi.prescription_id,
            s.seller_type, s.partner_id, poi.partner_inv_id
     FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN order_shipments s ON s.id = oi.shipment_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id AND poi.dispatch_status = 'pending'
     WHERE oi.order_id = $1 AND oi.supply_qty > 0 AND s.status <> 'cancelled'
     ORDER BY oi.product_name, oi.id FOR UPDATE OF oi`, [orderId])).rows;
}

async function setQuantityTx(client: PoolClient, orderId: string, l: OrderLine, quantity: number) {
  const a = lineAmounts(l.unit_price_paise, quantity, l.gst_rate, await isInterState(client, orderId, l));
  await client.query(
    `UPDATE order_items SET quantity = $2, cgst_paise = $3, sgst_paise = $4, igst_paise = $5, gst_amount_paise = $6, line_total_paise = $7
     WHERE id = $1`, [l.order_item_id, quantity, a.cgst, a.sgst, a.igst, a.gst, a.total]);
  await client.query(
    `UPDATE partner_order_items SET allocated_qty = $2, line_value_paise = $3, line_gst_paise = $4
     WHERE order_item_id = $1 AND dispatch_status = 'pending'`, [l.order_item_id, quantity, a.assessable, a.gst]);
}

/** Lower a line (or remove it at 0): the reserved stock goes back on the shelf. */
export async function lowerLineTx(client: PoolClient, orderId: string, l: OrderLine, toQty: number) {
  const back = l.quantity - toQty;
  if (l.batch_id) {
    await client.query(`UPDATE inventory_batches SET quantity_reserved = GREATEST(quantity_reserved - $2, 0) WHERE id = $1`, [l.batch_id, back]);
  }
  if (l.partner_inv_id) {
    await client.query(`UPDATE partner_inventory SET qty_reserved = GREATEST(qty_reserved - $2, 0), last_updated_at = NOW() WHERE id = $1`,
      [l.partner_inv_id, back]);
  }
  if (toQty > 0) return setQuantityTx(client, orderId, l, toQty);
  // Not invoiced: the line is taken off the order (the change itself is kept in order_edits)
  await client.query(`DELETE FROM partner_order_items WHERE order_item_id = $1 AND dispatch_status = 'pending'`, [l.order_item_id]);
  await client.query(`DELETE FROM order_items WHERE id = $1`, [l.order_item_id]);
}

const sameStock = (l: OrderLine, a: Allocation) => a.seller_type === l.seller_type && a.partner_id === l.partner_id
  && (a.seller_type === 'dawabag' ? a.batch_id === l.batch_id : a.partner_inventory_id === l.partner_inv_id);

const priced = (l: Pick<OrderLine, 'product_id' | 'product_name' | 'sku' | 'unit_price_paise' | 'mrp_paise' | 'gst_rate' | 'cold_chain'>, quantity: number): PricedLine => {
  const assessable = l.unit_price_paise * quantity;
  const gst = Math.round(assessable * l.gst_rate / 100);
  return { product_id: l.product_id, product_name: l.product_name, sku: l.sku, quantity, unit_price_paise: l.unit_price_paise,
    mrp_paise: l.mrp_paise, gst_rate: l.gst_rate, gst_amount_paise: gst, assessable_paise: assessable, line_total_paise: assessable + gst,
    cold_chain: l.cold_chain };
};

/**
 * Raise a line: the extra units are allocated again (seller chosen and stock reserved as at
 * placement). Same seller and batch → the line grows; otherwise a new line on that seller's
 * shipment. The raised units keep the line's price. Returns the shipment ids touched.
 */
export async function raiseLineTx(client: PoolClient, orderId: string, l: OrderLine, toQty: number,
  ctx: { pincode: string; saleKind: SaleKind; orderValuePaise: number }): Promise<string[]> {
  const extra = toQty - l.quantity;
  const [alloc] = await allocateAndReserve(client, {
    lines: [{ product_id: l.product_id, product_name: l.product_name, quantity: extra, cold_chain: l.cold_chain }],
    orderValuePaise: ctx.orderValuePaise, pincode: ctx.pincode, saleKind: ctx.saleKind,
  });
  if (sameStock(l, alloc)) {
    await setQuantityTx(client, orderId, l, toQty);
    return [l.shipment_id];
  }
  const shipments = await placeLinesTx(client, orderId, [priced(l, extra)], [alloc]);
  return shipments.map((s) => s.id);
}

/** Add new medicines: allocated and placed on their sellers' shipments (existing or new). */
export async function addLinesTx(client: PoolClient, orderId: string, lines: PricedLine[],
  ctx: { pincode: string; saleKind: SaleKind; orderValuePaise: number }): Promise<{ shipmentIds: string[]; allocations: Allocation[] }> {
  if (!lines.length) return { shipmentIds: [], allocations: [] };
  const allocations = await allocateAndReserve(client, {
    lines: lines.map((li) => ({ product_id: li.product_id, product_name: li.product_name, quantity: li.quantity, cold_chain: li.cold_chain })),
    orderValuePaise: ctx.orderValuePaise, pincode: ctx.pincode, saleKind: ctx.saleKind,
  });
  const shipments = await placeLinesTx(client, orderId, lines, allocations);
  return { shipmentIds: shipments.map((s) => s.id), allocations };
}

