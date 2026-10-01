// Dawabag's own riders (C-26 hand-over only; C-41 least access). A parcel that
// Dawabag delivers itself is assigned to one rider at dispatch (or reassigned
// while out). A rider sees only the parcels assigned to them, and only what the
// hand-over needs: where, to whom, the seal and whether a delivery code is due —
// never the medicines inside.
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';

export async function listRiders() {
  return query(
    `SELECT u.id, up.full_name, u.mobile,
            (SELECT COUNT(*)::int FROM order_shipments s WHERE s.rider_id = u.id AND s.status = 'dispatched') AS out_now
     FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.role = 'delivery' AND u.is_active AND u.deleted_at IS NULL ORDER BY up.full_name`);
}

async function assertRider(client: PoolClient, riderId: string) {
  const r = (await client.query(`SELECT 1 FROM users WHERE id = $1 AND role = 'delivery' AND is_active AND deleted_at IS NULL`, [riderId])).rows[0];
  if (!r) throw new AppError('Rider not found', 404);
}

// Inside the dispatch transaction: the parcel leaves with this rider
export async function assignAtDispatch(client: PoolClient, shipmentId: string, riderId: string, by: string) {
  await assertRider(client, riderId);
  const run = `DWR${String((await client.query(`SELECT nextval('rider_run_seq') AS n`)).rows[0].n).padStart(7, '0')}`;
  await client.query(`UPDATE order_shipments SET rider_id = $2, assigned_at = NOW(), assigned_by = $3 WHERE id = $1`, [shipmentId, riderId, by]);
  return { courier: 'Dawabag rider', awb: run };
}

// A parcel already out with one rider handed to another
export async function reassignRider(by: string, shipmentId: string, riderId: string) {
  return withTransaction(async (client) => {
    const s = (await client.query(`SELECT status, rider_id, order_id FROM order_shipments WHERE id = $1 AND seller_type = 'dawabag' FOR UPDATE`, [shipmentId])).rows[0];
    if (!s) throw new AppError('Shipment not found', 404);
    if (s.status !== 'dispatched' || !s.rider_id) throw new AppError('Only a parcel out with a Dawabag rider can be reassigned', 409);
    await assertRider(client, riderId);
    await client.query(`UPDATE order_shipments SET rider_id = $2, assigned_at = NOW(), assigned_by = $3 WHERE id = $1`, [shipmentId, riderId, by]);
    await writeAuditTx(client, { userId: null, action: 'rider_reassigned', performedBy: by, newValue: { shipment_id: shipmentId, from: s.rider_id, to: riderId } });
    return { shipment_id: shipmentId, rider_id: riderId };
  });
}

// The rider's run sheet
export async function myRun(riderId: string) {
  return query(
    `SELECT s.id AS shipment_id, s.invoice_number, o.order_number, s.awb_number AS run_ref, s.seal_number, s.cold_chain, s.handover_code_required,
            s.handover_attempts, s.dispatched_at, a.full_name AS deliver_to, a.mobile AS contact_mobile,
            concat_ws(', ', a.address_line1, a.address_line2, a.city, a.pincode) AS address,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.shipment_id = s.id) AS item_lines
     FROM order_shipments s JOIN orders o ON o.id = s.order_id JOIN addresses a ON a.id = o.address_id
     WHERE s.rider_id = $1 AND s.status = 'dispatched' ORDER BY a.pincode, s.dispatched_at`, [riderId]);
}

// Whether this delivery user carries this shipment
export async function ridesShipment(riderId: string, shipmentId: string): Promise<boolean> {
  return !!(await queryOne(`SELECT 1 FROM order_shipments WHERE id = $1 AND rider_id = $2 AND status = 'dispatched'`, [shipmentId, riderId]));
}
