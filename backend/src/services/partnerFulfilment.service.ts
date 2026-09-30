// src/services/partnerFulfilment.service.ts
// Partner shipments: what a partner must ship, dispatch with AWB, delivery.
// Dispatch consumes the reserved batch stock.
import { query, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { assertRxCleared, recordH1Dispensing } from './rxGate.service';
import { assertNoRecalledLines } from './recall.service';
import { HandoverInput, checkHandover, handoverCode, prepareHandover, recordHandover } from './handover.service';
import { queueNotification } from './notification.service';
import { syncOrderStatus } from './fulfilment.service';

export async function listPartnerShipments(vendorId: string, status?: string) {
  return query(
    `SELECT s.id, s.invoice_number, s.status, s.subtotal_paise, s.gst_paise, s.total_paise, s.cold_chain,
            s.courier_partner, s.awb_number, s.dispatched_at, s.delivered_at, s.created_at,
            o.order_number, o.status AS order_status,
            a.full_name AS ship_to_name, a.mobile AS ship_to_mobile, a.address_line1, a.city, a.state, a.pincode,
            json_agg(json_build_object(
              'product_name', oi.product_name, 'sku', oi.sku, 'quantity', oi.quantity,
              'unit_price_paise', oi.unit_price_paise, 'gst_rate', oi.gst_rate,
              'batch_number', pi.batch_number, 'expiry_date', pi.expiry_date) ORDER BY oi.product_name) AS lines
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     JOIN order_items oi ON oi.shipment_id = s.id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     WHERE s.partner_id = $1 ${status ? 'AND s.status = $2' : ''}
       -- Prepaid orders become the partner's job only once paid
       AND o.status NOT IN ('pending_payment', 'payment_failed')
     GROUP BY s.id, o.id, a.id
     ORDER BY s.created_at DESC LIMIT 200`,
    status ? [vendorId, status] : [vendorId]);
}

export async function dispatchShipment(vendorId: string, shipmentId: string, courier: string, awb: string, userId: string, sealNumber: string) {
  return withTransaction(async (client) => {
    const s = (await client.query(
      `SELECT s.id, s.status, s.created_at, o.status AS order_status, o.id AS order_id
       FROM order_shipments s JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1 AND s.partner_id = $2 FOR UPDATE OF s`, [shipmentId, vendorId])).rows[0];
    if (!s) throw new AppError('Shipment not found', 404);
    if (s.status !== 'pending' && s.status !== 'packed') throw new AppError(`Shipment is already ${s.status}`, 409);
    if (['pending_payment', 'payment_failed', 'rx_pending', 'rx_rejected', 'cancelled'].includes(s.order_status)) {
      throw new AppError(`Order is ${s.order_status.replace('_', ' ')}; it cannot be dispatched yet`, 409);
    }
    await assertRxCleared(client, s.order_id, shipmentId);
    await assertNoRecalledLines(client, shipmentId);
    // Reserved → shipped: take the units out of the partner's batch
    await client.query(
      `UPDATE partner_inventory pi
       SET qty_available = pi.qty_available - poi.allocated_qty,
           qty_reserved = GREATEST(pi.qty_reserved - poi.allocated_qty, 0), last_updated_at = NOW()
       FROM partner_order_items poi
       WHERE poi.shipment_id = $1 AND poi.partner_inv_id = pi.id AND poi.dispatch_status = 'pending'`, [shipmentId]);
    await client.query(
      `UPDATE partner_order_items SET dispatch_status = 'dispatched', dispatched_at = NOW(),
         dispatch_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 1)
       WHERE shipment_id = $1 AND dispatch_status = 'pending'`, [shipmentId]);
    await recordH1Dispensing(client, shipmentId);
    await client.query(
      `UPDATE order_shipments SET status = 'dispatched', courier_partner = $2, awb_number = $3, dispatched_at = NOW()
       WHERE id = $1`, [shipmentId, courier, awb]);
    const codeNeeded = await prepareHandover(client, shipmentId, s.order_id, sealNumber);
    await syncOrderStatus(client, s.order_id);
    await writeAuditTx(client, { userId, action: 'partner_shipment_dispatched', performedBy: userId,
      newValue: { shipment_id: shipmentId, order_id: s.order_id, courier, awb, seal_number: sealNumber } });
    const o = (await client.query(
      `SELECT o.user_id, o.order_number, s.dispatched_at FROM orders o JOIN order_shipments s ON s.order_id = o.id WHERE s.id = $1`,
      [shipmentId])).rows[0];
    await queueNotification({ userId: o.user_id, type: 'dispatched', orderId: s.order_id, orderNumber: o.order_number,
      awbNumber: awb, courierPartner: courier, handoverCode: codeNeeded ? handoverCode(shipmentId, o.dispatched_at) : undefined });
    return { id: shipmentId, status: 'dispatched' };
  });
}

// Partner (own shipment) or admin (any) confirms delivery; only delivered
// lines are settled.
export async function markShipmentDelivered(
  shipmentId: string, actor: { id: string; role: string }, vendorId?: string, handover: HandoverInput = {},
) {
  const userId = actor.id;
  // Delivery code and receiver checked first, so wrong attempts are counted (C-26)
  const { override } = await checkHandover(shipmentId, handover, actor.role);
  return withTransaction(async (client) => {
    const s = (await client.query(
      `SELECT id, status, order_id FROM order_shipments WHERE id = $1 ${vendorId ? 'AND partner_id = $2' : ''} FOR UPDATE`,
      vendorId ? [shipmentId, vendorId] : [shipmentId])).rows[0];
    if (!s) throw new AppError('Shipment not found', 404);
    if (s.status !== 'dispatched') throw new AppError('Only dispatched shipments can be marked delivered', 409);
    await client.query(`UPDATE order_shipments SET status = 'delivered', delivered_at = NOW() WHERE id = $1`, [shipmentId]);
    await recordHandover(client, shipmentId, handover, override, userId);
    await client.query(
      `UPDATE partner_order_items SET dispatch_status = 'delivered', delivered_at = NOW()
       WHERE shipment_id = $1 AND dispatch_status = 'dispatched'`, [shipmentId]);
    // The order is delivered once every shipment is
    await syncOrderStatus(client, s.order_id);
    await writeAuditTx(client, { userId, action: 'shipment_delivered', performedBy: userId, newValue: { shipment_id: shipmentId } });
    return { id: shipmentId, status: 'delivered' };
  });
}
