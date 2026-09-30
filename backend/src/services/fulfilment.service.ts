// src/services/fulfilment.service.ts
// Dawabag's own shipments: pack → dispatch → deliver (Sprint 4). Dispatch
// takes the units out of the reserved batches and writes the H1 register.
// Nothing moves while a prescription line is unverified (rxGate).
import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { assertRxCleared, recordH1Dispensing } from './rxGate.service';
import { assertNoRecalledLines } from './recall.service';
import { handoverCode, prepareHandover } from './handover.service';
import { queueNotification } from './notification.service';

// Orders ready for fulfilment: paid (packing), prescription-verified, or on credit (confirmed)
const READY = ['packing', 'rx_verified', 'confirmed', 'packed', 'dispatched'];

export type QueueStage = 'rx' | 'pack' | 'dispatch' | 'deliver';

export async function fulfilmentQueue(stage: QueueStage) {
  if (stage === 'rx') {
    return query(
      `SELECT o.id AS order_id, o.order_number, o.status, o.created_at, up.full_name AS buyer_name, u.customer_type,
              json_agg(json_build_object('prescription_id', rx.id, 'status', rx.status, 'uploaded_at', rx.created_at,
                'file_type', rx.file_type) ORDER BY rx.created_at) FILTER (WHERE rx.id IS NOT NULL) AS prescriptions
       FROM orders o JOIN users u ON u.id = o.user_id
       LEFT JOIN user_profiles up ON up.user_id = o.user_id
       LEFT JOIN prescriptions rx ON rx.order_id = o.id
       WHERE o.status = 'rx_pending'
       GROUP BY o.id, up.full_name, u.customer_type ORDER BY o.created_at LIMIT 200`);
  }
  const shipmentStatus = { pack: 'pending', dispatch: 'packed', deliver: 'dispatched' }[stage];
  return query(
    `SELECT s.id AS shipment_id, s.invoice_number, s.status, s.total_paise, s.cold_chain, s.created_at,
            s.courier_partner, s.awb_number, o.id AS order_id, o.order_number, o.status AS order_status,
            a.full_name AS ship_to_name, a.city, a.pincode,
            json_agg(json_build_object('product_name', oi.product_name, 'quantity', oi.quantity,
              'batch_number', ib.batch_number, 'expiry_date', ib.expiry_date, 'rx_cleared',
              oi.prescription_id IS NOT NULL) ORDER BY oi.product_name) AS lines
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     JOIN order_items oi ON oi.shipment_id = s.id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     WHERE s.seller_type = 'dawabag' AND s.status = $1 AND o.status = ANY($2::text[])
     GROUP BY s.id, o.id, a.id ORDER BY s.created_at LIMIT 200`,
    [shipmentStatus, READY]);
}

async function lockOwnShipment(client: PoolClient, shipmentId: string) {
  const s = (await client.query(
    `SELECT s.id, s.status, s.order_id, o.status AS order_status, o.order_number, o.user_id
     FROM order_shipments s JOIN orders o ON o.id = s.order_id
     WHERE s.id = $1 AND s.seller_type = 'dawabag' FOR UPDATE OF s`, [shipmentId])).rows[0];
  if (!s) throw new AppError('Shipment not found', 404);
  if (!READY.includes(s.order_status)) throw new AppError(`Order is ${s.order_status.replace('_', ' ')}; not ready for fulfilment`, 409);
  return s;
}

export async function packShipment(shipmentId: string, userId: string) {
  return withTransaction(async (client) => {
    const s = await lockOwnShipment(client, shipmentId);
    if (s.status !== 'pending') throw new AppError(`Shipment is already ${s.status}`, 409);
    await assertRxCleared(client, s.order_id, shipmentId);
    await assertNoRecalledLines(client, shipmentId);
    await client.query(`UPDATE order_shipments SET status = 'packed' WHERE id = $1`, [shipmentId]);
    await client.query(`UPDATE orders SET status = 'packed', pharmacist_pack_id = $2, packed_at = NOW(), updated_at = NOW()
                        WHERE id = $1 AND status IN ('packing', 'rx_verified', 'confirmed')`, [s.order_id, userId]);
    await writeAuditTx(client, { userId: s.user_id, action: 'shipment_packed', performedBy: userId, newValue: { shipment_id: shipmentId } });
    return { id: shipmentId, status: 'packed' };
  });
}

export async function dispatchOwnShipment(shipmentId: string, courier: string, awb: string, userId: string, sealNumber: string) {
  return withTransaction(async (client) => {
    const s = await lockOwnShipment(client, shipmentId);
    if (s.status !== 'packed') throw new AppError('Pack the shipment before dispatch', 409);
    await assertRxCleared(client, s.order_id, shipmentId);
    await assertNoRecalledLines(client, shipmentId);
    // Reserved → shipped
    await client.query(
      `UPDATE inventory_batches b
       SET quantity_available = b.quantity_available - oi.quantity,
           quantity_reserved = GREATEST(b.quantity_reserved - oi.quantity, 0)
       FROM order_items oi WHERE oi.shipment_id = $1 AND oi.batch_id = b.id`, [shipmentId]);
    const h1 = await recordH1Dispensing(client, shipmentId);
    await client.query(
      `UPDATE order_shipments SET status = 'dispatched', courier_partner = $2, awb_number = $3, dispatched_at = NOW() WHERE id = $1`,
      [shipmentId, courier, awb]);
    const codeNeeded = await prepareHandover(client, shipmentId, s.order_id, sealNumber);
    await syncOrderStatus(client, s.order_id);
    await writeAuditTx(client, { userId: s.user_id, action: 'shipment_dispatched', performedBy: userId,
      newValue: { shipment_id: shipmentId, courier, awb, h1_register_rows: h1 } });
    await queueNotification({ userId: s.user_id, type: 'dispatched', orderId: s.order_id, orderNumber: s.order_number,
      awbNumber: awb, courierPartner: courier, handoverCode: codeNeeded ? await dispatchedCode(client, shipmentId) : undefined });
    return { id: shipmentId, status: 'dispatched', h1_register_rows: h1 };
  });
}

// Order status follows its shipments: dispatched when none is still waiting,
// delivered when all are delivered.
export async function syncOrderStatus(client: PoolClient, orderId: string) {
  const r = (await client.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'packed'))::int AS waiting,
            COUNT(*) FILTER (WHERE status = 'dispatched')::int AS moving,
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS done
     FROM order_shipments WHERE order_id = $1 AND status <> 'cancelled'`, [orderId])).rows[0];
  if (r.waiting === 0 && r.moving > 0) {
    await client.query(`UPDATE orders SET status = 'dispatched', dispatched_at = NOW(), updated_at = NOW() WHERE id = $1 AND status <> 'dispatched'`, [orderId]);
  } else if (r.waiting === 0 && r.moving === 0 && r.done > 0) {
    await client.query(`UPDATE orders SET status = 'delivered', delivered_at = NOW(), updated_at = NOW() WHERE id = $1 AND status <> 'delivered'`, [orderId]);
  }
}

async function dispatchedCode(client: PoolClient, shipmentId: string) {
  const r = (await client.query('SELECT dispatched_at FROM order_shipments WHERE id = $1', [shipmentId])).rows[0];
  return handoverCode(shipmentId, r.dispatched_at);
}
