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
    `SELECT oi.id AS order_item_id, oi.product_id, oi.product_name, p.drug_schedule, oi.supply_qty AS quantity,
            oi.prescription_id, oi.shipment_id
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     -- Sprint 43: a line the buyer removed before packing needs no prescription
     WHERE oi.order_id = $1 AND oi.supply_qty > 0`,
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

// H1 register rows for the prescription lines of a shipment being dispatched — Sprint 38:
// complete entries only, per seller licence, hash-chained (h1Register/record.service.ts)
export { recordH1Dispensing } from './h1Register/record.service';
