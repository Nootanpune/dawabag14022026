// src/services/rxGate.service.ts
// The prescription gate (Rulebook C-08) and Schedule H1 register (C-09),
// shared by Dawabag and partner fulfilment. A line needs a prescription when
// requiresPrescription(buyer's effective type, schedule) — licensed buyers are
// exempt. Such a line cannot be packed or dispatched until a pharmacist has
// linked a verified, unexpired prescription to it.
import { PoolClient } from 'pg';
import { AppError } from '../utils/AppError';
import { effectiveCustomerType, requiresPrescription } from '../utils/customerType';

export interface RxLine {
  order_item_id: string;
  product_id: string;
  product_name: string;
  drug_schedule: string;
  quantity: number;
  prescription_id: string | null;
  shipment_id: string | null;
}

export async function rxRequiredLines(client: PoolClient, orderId: string): Promise<RxLine[]> {
  const buyer = (await client.query(
    `SELECT u.customer_type, u.kyc_status FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [orderId])).rows[0];
  if (!buyer) throw new AppError('Order not found', 404);
  const type = effectiveCustomerType(buyer.customer_type, buyer.kyc_status);
  const lines = (await client.query(
    `SELECT oi.id AS order_item_id, oi.product_id, oi.product_name, p.drug_schedule, oi.quantity,
            oi.prescription_id, oi.shipment_id
     FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1`,
    [orderId])).rows as RxLine[];
  return lines.filter((l) => requiresPrescription(type, l.drug_schedule));
}

// Throws 409 when a line of the order (or of one shipment) still needs a prescription
export async function assertRxCleared(client: PoolClient, orderId: string, shipmentId?: string): Promise<void> {
  const pending = (await rxRequiredLines(client, orderId))
    .filter((l) => !l.prescription_id && (!shipmentId || l.shipment_id === shipmentId));
  if (pending.length) {
    throw new AppError(
      `Prescription not yet verified by the pharmacist for: ${pending.map((l) => l.product_name).join(', ')}`, 409);
  }
}

// H1 register rows for the prescription lines of a shipment being dispatched
export async function recordH1Dispensing(client: PoolClient, shipmentId: string): Promise<number> {
  const rows = (await client.query(
    `SELECT s.seller_type, s.partner_id, o.id AS order_id, oi.id AS order_item_id, oi.product_id,
            oi.product_name, oi.quantity,
            COALESCE(ib.batch_number, pi.batch_number) AS batch_number,
            rx.id AS prescription_id, rx.patient_name, rx.prescriber_name, rx.prescriber_reg_no,
            COALESCE(pp.h1_pharmacist_name, vp.full_name) AS pharmacist_name,
            COALESCE(pp.h1_pharmacist_reg_no, rx.pharmacist_reg_no) AS pharmacist_reg_no,
            concat_ws(', ', a.full_name, a.address_line1, a.city, a.state, a.pincode) AS patient_address
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     JOIN order_items oi ON oi.shipment_id = s.id
     JOIN products p ON p.id = oi.product_id AND p.drug_schedule = 'Schedule H1'
     JOIN prescriptions rx ON rx.id = oi.prescription_id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     LEFT JOIN partner_products pp ON pp.id = poi.partner_product_id
     LEFT JOIN user_profiles vp ON vp.user_id = rx.verified_by
     WHERE s.id = $1`, [shipmentId])).rows;

  for (const r of rows) {
    await client.query(
      `INSERT INTO h1_register
         (seller_type, partner_id, order_id, order_item_id, product_id, product_name, batch_number, quantity,
          patient_name, patient_address, prescriber_name, prescriber_reg_no, prescription_id,
          pharmacist_name, pharmacist_reg_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (order_item_id) DO NOTHING`,
      [r.seller_type, r.partner_id, r.order_id, r.order_item_id, r.product_id, r.product_name, r.batch_number,
       r.quantity, r.patient_name || 'Not recorded', r.patient_address, r.prescriber_name || 'Not recorded',
       r.prescriber_reg_no, r.prescription_id, r.pharmacist_name, r.pharmacist_reg_no]);
  }
  return rows.length;
}
