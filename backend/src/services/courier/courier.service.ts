// Courier booking for Dawabag's own shipments and tracking updates from the
// courier's webhook. Prescription parcels are handed over only against the
// buyer's delivery code (C-26): a courier "delivered" scan does not close them.
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { getSetting } from '../settings.service';
import { queueNotification } from '../notification.service';
import { markShipmentDelivered } from '../partnerFulfilment.service';
import { createShipment, shiprocketConfigured } from './shiprocket.client';
import { courierTime, normaliseStatus } from './status';

export async function bookCourier(userId: string, shipmentId: string) {
  if ((await getSetting('courier.provider', 'manual')) !== 'shiprocket') throw new AppError('Courier booking is manual; enter the courier and AWB at dispatch', 409);
  if (!shiprocketConfigured()) throw new AppError('Shiprocket is not configured', 503);
  const s = await queryOne<any>(
    `SELECT s.id, s.status, s.seller_type, s.invoice_number, s.total_paise, s.awb_number, s.cold_chain, o.created_at,
            a.full_name, concat_ws(', ', a.address_line1, a.address_line2) AS address, a.city, a.state, a.pincode, a.mobile, u.email
     FROM order_shipments s JOIN orders o ON o.id = s.order_id JOIN addresses a ON a.id = o.address_id JOIN users u ON u.id = o.user_id
     WHERE s.id = $1`, [shipmentId]);
  if (!s || s.seller_type !== 'dawabag') throw new AppError('Shipment not found', 404);
  if (s.status !== 'packed') throw new AppError('Book the courier after packing, before dispatch', 409);
  if (s.awb_number) throw new AppError('This shipment already has an AWB', 409);
  // Claim it first so two clicks cannot book two couriers (released if the booking fails)
  const claimed = await query(`UPDATE order_shipments SET courier_provider = 'shiprocket:booking' WHERE id = $1 AND awb_number IS NULL
                               AND (courier_provider IS NULL OR courier_provider = 'shiprocket') RETURNING id`, [shipmentId]);
  if (!claimed.length) throw new AppError('A courier booking for this shipment is already in progress', 409);
  let booked: Awaited<ReturnType<typeof createShipment>>;
  try {
    booked = await createShipment({
    order_id: s.invoice_number, order_date: new Date(s.created_at).toISOString().slice(0, 16).replace('T', ' '),
    pickup_location: String(await getSetting('courier.pickup_location', 'Primary')),
    name: s.full_name, address: s.address, city: s.city, pincode: s.pincode, state: s.state, phone: s.mobile, email: s.email,
    sub_total: Math.round(Number(s.total_paise) / 100), weight_kg: s.cold_chain ? 2.5 : 0.5,
  });
  } catch (e) {
    await query(`UPDATE order_shipments SET courier_provider = NULL WHERE id = $1 AND courier_provider = 'shiprocket:booking'`, [shipmentId]);
    throw e;
  }
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE order_shipments SET courier_provider = 'shiprocket', courier_order_ref = $2, courier_shipment_ref = $3,
         awb_number = $4, courier_partner = $5, tracking_status = 'booked' WHERE id = $1 AND awb_number IS NULL`,
      [shipmentId, booked.orderRef, booked.shipmentRef, booked.awb, booked.courier]);
    await client.query(
      `INSERT INTO shipment_tracking_events (shipment_id, status, raw_status, event_time) VALUES ($1, 'booked', 'AWB ASSIGNED', NOW())
       ON CONFLICT DO NOTHING`, [shipmentId]);
    await writeAuditTx(client, { userId: null, action: 'courier_booked', performedBy: userId, newValue: { shipment_id: shipmentId, awb: booked.awb, courier: booked.courier } });
    return { shipment_id: shipmentId, awb_number: booked.awb, courier_partner: booked.courier };
  });
}

export function webhookAuthorised(given: string | undefined): boolean {
  const want = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// One tracking update from the courier. Idempotent: a repeated scan is ignored.
export async function applyTrackingUpdate(p: { awb: string; current_status: string; current_timestamp?: string; location?: string }) {
  const s = await queryOne<any>(
    `SELECT s.id, s.status, s.handover_code_required, s.order_id, o.user_id, o.order_number
     FROM order_shipments s JOIN orders o ON o.id = s.order_id WHERE s.awb_number = $1`, [p.awb]);
  if (!s) return { ignored: 'unknown AWB' };
  const status = normaliseStatus(p.current_status);
  const at = courierTime(p.current_timestamp) ?? new Date();
  const ins = await query(
    `INSERT INTO shipment_tracking_events (shipment_id, status, raw_status, location, event_time) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (shipment_id, raw_status, event_time) DO NOTHING RETURNING id`,
    [s.id, status, p.current_status.slice(0, 100), p.location?.slice(0, 200) ?? null, at]);
  if (!ins.length) return { duplicate: true };
  await query(`UPDATE order_shipments SET tracking_status = $2 WHERE id = $1`, [s.id, status]);

  if (status === 'out_for_delivery') {
    await queueNotification({ userId: s.user_id, type: 'out_for_delivery', orderId: s.order_id, orderNumber: s.order_number, codeNeeded: s.handover_code_required });
  } else if (status === 'delivered' && s.status === 'dispatched') {
    if (!s.handover_code_required) {
      await markShipmentDelivered(s.id, { id: null, role: 'system' }, undefined, { received_by_name: 'Courier delivery' });
    } else {
      await alertAdmins('courier_rx_delivered', { orderNumber: s.order_number, awbNumber: p.awb });
    }
  } else if (status === 'rto') {
    // Alert once per parcel, however many RTO scans follow
    const first = await query(`UPDATE order_shipments SET rto_at = NOW() WHERE id = $1 AND rto_at IS NULL RETURNING id`, [s.id]);
    if (first.length) await alertAdmins('courier_rto', { orderNumber: s.order_number, awbNumber: p.awb });
  }
  return { status };
}

async function alertAdmins(type: string, extra: Record<string, unknown>) {
  const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active AND deleted_at IS NULL`);
  for (const a of admins) await queueNotification({ userId: a.id, type, ...extra });
}

export async function trackingFor(shipmentIds: string[]) {
  if (!shipmentIds.length) return [];
  return query(
    `SELECT shipment_id, status, raw_status, location, event_time FROM shipment_tracking_events
     WHERE shipment_id = ANY($1::uuid[]) ORDER BY event_time`, [shipmentIds]);
}
