// src/services/fulfilment.service.ts
// Dawabag's own shipments: pack → dispatch → deliver (Sprint 4). Dispatch
// takes the units out of the reserved batches and writes the H1 register.
// Nothing moves while a prescription line is unverified (rxGate) or before a
// registered pharmacist has checked and released the shipment (Sprint 35, C-08).
import { PoolClient } from 'pg';
import { query, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { assertRxCleared, recordH1Dispensing } from './rxGate.service';
import { assertNoRecalledLines } from './recall.service';
import { DispatchRecord, handoverCode, prepareHandover } from './handover.service';
import { queueNotification } from './notification.service';
import { assignAtDispatch } from './delivery/rider.service';
import { mayDispatch, mayPack, notReleasedMessage } from './pharmacistCheck/rules';
import { assertEinvoiceReady, ensureInvoiceEinvoice, prepareDispatchEinvoice } from './einvoice/einvoice.service';

// Orders ready for fulfilment: paid (packing), prescription-verified, or on credit (confirmed)
const READY = ['packing', 'rx_verified', 'confirmed', 'packed', 'dispatched'];

export type QueueStage = 'rx' | 'pack' | 'dispatch' | 'deliver';

export async function fulfilmentQueue(stage: QueueStage) {
  if (stage === 'rx') {
    return query(
      `SELECT o.id AS order_id, o.order_number, o.status, o.created_at, up.full_name AS buyer_name, u.customer_type,
              o.requested_prescription_id,   -- saved prescription the buyer offered (apply it after checking)
              (SELECT json_build_object('prescriber_name', r2.prescriber_name, 'prescribed_on', r2.prescribed_on,
                 'valid_until', r2.valid_until, 'file_type', r2.file_type) FROM prescriptions r2
               WHERE r2.id = o.requested_prescription_id) AS requested_prescription,
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
            s.courier_partner, s.awb_number, s.seal_number, s.handover_code_required, o.id AS order_id, o.order_number, o.status AS order_status,
            -- Sprint 35: packers see what is still waiting for the pharmacist, with Pack refused (C-08)
            s.pharmacist_check, s.pharmacist_check_note, s.pharmacist_name, s.pharmacist_reg_no, s.pharmacist_checked_at,
            a.full_name AS ship_to_name, a.city, a.pincode,
            json_agg(json_build_object('product_name', oi.product_name, 'quantity', oi.quantity,
              'batch_number', ib.batch_number, 'expiry_date', ib.expiry_date, 'rx_cleared',
              -- cleared: verified prescription, or none needed (not Schedule H/H1, or a
              -- KYC-approved trade buyer) — the rule moveOrderToFulfilment applies (C-08)
              oi.prescription_id IS NOT NULL OR p.drug_schedule NOT IN ('Schedule H', 'Schedule H1')
                OR (u.customer_type <> 'customer' AND u.kyc_status = 'approved')) ORDER BY oi.product_name) AS lines
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     JOIN users u ON u.id = o.user_id
     JOIN order_items oi ON oi.shipment_id = s.id
     JOIN products p ON p.id = oi.product_id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     WHERE s.seller_type = 'dawabag' AND s.status = $1 AND o.status = ANY($2::text[])
     GROUP BY s.id, o.id, a.id, u.customer_type, u.kyc_status ORDER BY (s.pharmacist_check NOT IN ('released', 'not_recorded')), s.created_at LIMIT 200`,
    [shipmentStatus, READY]);
}

async function lockOwnShipment(client: PoolClient, shipmentId: string) {
  const s = (await client.query(
    `SELECT s.id, s.status, s.order_id, s.courier_partner, s.awb_number, s.courier_provider, s.pharmacist_check, s.pharmacist_check_note,
            o.status AS order_status, o.order_number, o.user_id
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
    // Every order is checked and released by a registered pharmacist first (Sprint 35, C-08)
    if (!mayPack(s.pharmacist_check)) throw new AppError(notReleasedMessage(s.pharmacist_check, s.pharmacist_check_note, 'dawabag'), 409);
    await assertRxCleared(client, s.order_id, shipmentId);
    await assertNoRecalledLines(client, shipmentId);
    await client.query(`UPDATE order_shipments SET status = 'packed' WHERE id = $1`, [shipmentId]);
    await client.query(`UPDATE orders SET status = 'packed', pharmacist_pack_id = $2, packed_at = NOW(), updated_at = NOW()
                        WHERE id = $1 AND status IN ('packing', 'rx_verified', 'confirmed')`, [s.order_id, userId]);
    await writeAuditTx(client, { userId: s.user_id, action: 'shipment_packed', performedBy: userId, newValue: { shipment_id: shipmentId } });
    // B2B invoice: register it with the IRP while the parcel waits for the courier (C-31)
    const einvoice = await ensureInvoiceEinvoice(client, shipmentId);
    return { id: shipmentId, status: 'packed', einvoice_required: !!einvoice };
  });
}

export async function dispatchOwnShipment(shipmentId: string, courierIn: string | undefined, awbIn: string | undefined, userId: string, dispatch: DispatchRecord, riderId?: string) {
  await prepareDispatchEinvoice(shipmentId);
  const { result, notice } = await withTransaction(async (client) => {
    const s = await lockOwnShipment(client, shipmentId);
    if (s.status !== 'packed') throw new AppError('Pack the shipment before dispatch', 409);
    // A shipment booked with the courier (courier.service) already has both; a rider gets a run reference
    if (riderId && s.awb_number) throw new AppError('This shipment is booked with a courier', 409);
    // A Shiprocket booking still in flight would leave a live courier pickup for a parcel already gone
    if (s.courier_provider === 'shiprocket:booking') throw new AppError('A courier booking for this shipment is in progress; wait for it', 409);
    const own = riderId ? await assignAtDispatch(client, shipmentId, riderId, userId) : null;
    const courier = own?.courier ?? courierIn ?? s.courier_partner, awb = own?.awb ?? awbIn ?? s.awb_number;
    if (!courier || !awb) throw new AppError('Enter the courier and AWB number, or book the courier first', 400);
    if (!mayDispatch(s.pharmacist_check)) throw new AppError(notReleasedMessage(s.pharmacist_check, s.pharmacist_check_note, 'dawabag'), 409);
    await assertRxCleared(client, s.order_id, shipmentId);
    await assertNoRecalledLines(client, shipmentId);
    await assertEinvoiceReady(client, shipmentId);
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
    const codeNeeded = await prepareHandover(client, shipmentId, s.order_id, dispatch);
    await syncOrderStatus(client, s.order_id);
    await writeAuditTx(client, { userId: s.user_id, action: 'shipment_dispatched', performedBy: userId,
      newValue: { shipment_id: shipmentId, courier, awb, h1_register_rows: h1 } });
    const notice = { userId: s.user_id, type: 'dispatched', orderId: s.order_id, orderNumber: s.order_number,
      awbNumber: awb, courierPartner: courier, handoverCode: codeNeeded ? await dispatchedCode(client, shipmentId) : undefined };
    return { result: { id: shipmentId, status: 'dispatched', courier_partner: courier, awb_number: awb, h1_register_rows: h1 }, notice };
  });
  // Told only once the dispatch is committed: a refused dispatch never messages the buyer
  await queueNotification(notice);
  return result;
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
