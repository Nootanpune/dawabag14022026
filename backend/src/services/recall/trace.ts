// Batch traceability (C-28): who received or is waiting for one batch of a product, from
// Dawabag's stock and from every partner's, plus the Schedule H1 register entries and the
// stock still on hand by location. One query set, used by the real recall
// (recall.service: notify buyers, block the batch) and by the mock recall drill
// (recallDrills/: trace only, nobody contacted) — Sprint 40 moved it here from
// recall.service so both run exactly the same trace.
import { PoolClient } from 'pg';

type Q = Pick<PoolClient, 'query'>;

/** Order lines supplied (or reserved) from the batch — Dawabag's and partners'. */
export const AFFECTED_SQL = `
  SELECT DISTINCT o.id AS order_id, o.order_number, o.user_id, o.status AS order_status, o.created_at AS ordered_at,
         oi.id AS order_item_id, oi.quantity, s.id AS shipment_id, s.status AS shipment_status, s.seller_type,
         s.partner_id, v.name AS partner_name, s.dispatched_at, s.delivered_at, s.awb_number, s.courier_partner,
         up.full_name AS buyer_name, u.customer_type AS buyer_type, a.city AS buyer_city, a.pincode AS buyer_pincode
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  LEFT JOIN users u ON u.id = o.user_id
  LEFT JOIN order_shipments s ON s.id = oi.shipment_id
  LEFT JOIN vendors v ON v.id = s.partner_id
  LEFT JOIN user_profiles up ON up.user_id = o.user_id
  LEFT JOIN addresses a ON a.id = o.address_id
  LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
  LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
  LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
  WHERE oi.product_id = $1 AND o.status <> 'cancelled'
    AND (ib.batch_number = $2 OR pi.batch_number = $2)`;

export async function affectedLines(db: Q, productId: string, batchNumber: string) {
  return (await db.query(AFFECTED_SQL, [productId, batchNumber])).rows;
}

const H1_SQL = `
  SELECT h.id, h.register_key, h.entry_no, h.dispensed_at, h.seller_type, h.partner_id, h.order_id, h.quantity,
         h.patient_name, h.prescriber_name, h.pharmacist_name
  FROM h1_register h WHERE h.product_id = $1 AND h.batch_number = $2 ORDER BY h.dispensed_at`;

const STOCK_SQL = `
  SELECT 'dawabag' AS holder, NULL::uuid AS partner_id, 'Dawabag' AS holder_name, COALESCE(ib.storage_location, 'Dawabag store') AS location,
         ib.quantity_available AS qty_available, ib.quantity_reserved AS qty_reserved, ib.is_recalled, ib.gdp_status,
         to_char(ib.expiry_date, 'YYYY-MM-DD') AS expiry_date
  FROM inventory_batches ib WHERE ib.product_id = $1 AND ib.batch_number = $2
  UNION ALL
  SELECT 'partner', pi.partner_id, v.name, COALESCE(pi.storage_location, v.city, 'Partner premises'),
         pi.qty_available, pi.qty_reserved, pi.is_recalled, pi.gdp_status, to_char(pi.expiry_date, 'YYYY-MM-DD')
  FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id JOIN vendors v ON v.id = pi.partner_id
  WHERE pp.product_id = $1 AND pi.batch_number = $2`;

const SUPPLIER_SQL = `
  SELECT 'dawabag' AS holder, g.grn_number AS reference, v.name AS supplier_name, g.supplier_invoice_no, g.supplier_invoice_date::text AS supplier_invoice_date
  FROM grn_lines l JOIN goods_receipts g ON g.id = l.grn_id JOIN vendors v ON v.id = g.vendor_id
  WHERE l.product_id = $1 AND l.batch_number = $2
  UNION ALL
  SELECT 'partner', pv.name, pb.supplier_name, pb.supplier_invoice_no, pb.supplier_invoice_date::text
  FROM partner_batch_provenance pb JOIN partner_inventory pi ON pi.id = pb.partner_inventory_id
  JOIN partner_products pp ON pp.id = pi.partner_product_id JOIN vendors pv ON pv.id = pi.partner_id
  WHERE pp.product_id = $1 AND pi.batch_number = $2`;

export interface TraceResult {
  lines: any[];
  h1_entries: any[];
  stock: any[];
  suppliers: any[];
}

/** The full trace of one batch (read-only; contacts nobody). */
export async function traceBatch(db: Q, productId: string, batchNumber: string): Promise<TraceResult> {
  const [lines, h1, stock, suppliers] = [
    await affectedLines(db, productId, batchNumber),
    (await db.query(H1_SQL, [productId, batchNumber])).rows,
    (await db.query(STOCK_SQL, [productId, batchNumber])).rows,
    (await db.query(SUPPLIER_SQL, [productId, batchNumber])).rows,
  ];
  return { lines, h1_entries: h1, stock, suppliers };
}

/** Counts for the drill summary / recall result (pure). */
export function traceSummary(t: TraceResult) {
  const orders = new Set(t.lines.map((l) => l.order_id));
  const buyers = new Set(t.lines.map((l) => l.user_id));
  const partners = new Set([...t.lines.filter((l) => l.partner_id).map((l) => l.partner_id), ...t.stock.filter((s) => s.partner_id).map((s) => s.partner_id)]);
  const shipped = t.lines.filter((l) => ['dispatched', 'delivered'].includes(l.shipment_status));
  return {
    orders: orders.size,
    buyers: buyers.size,
    units_supplied: shipped.reduce((s, l) => s + Number(l.quantity), 0),
    units_awaiting_dispatch: t.lines.filter((l) => !l.shipment_status || ['pending', 'packed'].includes(l.shipment_status))
      .reduce((s, l) => s + Number(l.quantity), 0),
    sold_by_dawabag: t.lines.filter((l) => l.seller_type === 'dawabag').length,
    sold_by_partners: t.lines.filter((l) => l.seller_type === 'partner').length,
    partners_involved: partners.size,
    h1_entries: t.h1_entries.length,
    stock_on_hand: t.stock.reduce((s, x) => s + Number(x.qty_available), 0),
    stock_locations: t.stock.filter((x) => Number(x.qty_available) > 0).length,
  };
}
