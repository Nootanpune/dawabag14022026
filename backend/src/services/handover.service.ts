// src/services/handover.service.ts — sealed dispatch and delivery handover (Rulebook C-26)
// Every shipment leaves in a tamper-evident pack whose seal number is recorded.
// Prescription shipments (or all, per the 'delivery.handover_code_scope'
// setting) are handed over only against a 6-digit code the buyer sees in the
// app / gets by SMS, to a named adult. The code is derived from the shipment
// and its dispatch time with an HMAC, so the shipment record holds no secret.
// Five wrong codes lock the handover until an admin overrides with a reason.
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { rxRequiredLines } from './rxGate.service';
import { getSetting } from './settings.service';

export interface HandoverInput {
  code?: string;
  received_by_name?: string;
  received_by_relation?: 'self' | 'family_adult' | 'other_adult';
  override_reason?: string;
}

const MAX_ATTEMPTS = 5;
const secret = () => process.env.HANDOVER_CODE_SECRET || process.env.JWT_ACCESS_SECRET || '';

export function handoverCode(shipmentId: string, dispatchedAt: Date | string): string {
  const mac = crypto.createHmac('sha256', secret()).update(`${shipmentId}|${new Date(dispatchedAt).toISOString()}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

export interface DispatchRecord {
  seal_number: string;
  cold_chain_temp_c?: number;     // pack temperature at dispatch, cold-chain shipments only (C-25)
  cold_chain_logger_id?: string;  // temperature data logger / validated pack id
}

// At dispatch: record the seal, the cold-chain reading, and whether a code is needed
export async function prepareHandover(client: PoolClient, shipmentId: string, orderId: string, d: DispatchRecord) {
  const sealNumber = d.seal_number;
  const cold = (await client.query('SELECT cold_chain FROM order_shipments WHERE id = $1', [shipmentId])).rows[0]?.cold_chain;
  if (cold) {
    if (d.cold_chain_temp_c === undefined || !d.cold_chain_logger_id) {
      throw new AppError('Cold-chain shipment: record the pack temperature and the data-logger id', 400);
    }
    if (d.cold_chain_temp_c < 2 || d.cold_chain_temp_c > 8) {
      throw new AppError(`Pack is at ${d.cold_chain_temp_c} °C; refrigerated items must leave at 2–8 °C`, 409);
    }
    await client.query('UPDATE order_shipments SET cold_chain_temp_c = $2, cold_chain_logger_id = $3 WHERE id = $1',
      [shipmentId, d.cold_chain_temp_c, d.cold_chain_logger_id]);
  }
  const scope = String(await getSetting('delivery.handover_code_scope', 'rx_only'));
  const required = scope === 'all'
    || (scope === 'rx_only' && (await rxRequiredLines(client, orderId)).some((l) => l.shipment_id === shipmentId));
  await client.query(`UPDATE order_shipments SET seal_number = $2, handover_code_required = $3 WHERE id = $1`,
    [shipmentId, sealNumber, required]);
  return required;
}

// Before marking delivered (outside the delivery transaction, so failed attempts are counted)
export async function checkHandover(shipmentId: string, input: HandoverInput, actorRole: string) {
  const s = await queryOne<any>(
    `SELECT id, status, dispatched_at, handover_code_required, handover_attempts FROM order_shipments WHERE id = $1`, [shipmentId]);
  if (!s || !s.handover_code_required) return { override: null as string | null };
  if (s.status !== 'dispatched') return { override: null };
  if (!input.received_by_name || !input.received_by_relation) {
    throw new AppError('Record who received this prescription order (the patient or an adult at the address)', 400);
  }
  if (input.override_reason) {
    if (!['admin', 'super_admin'].includes(actorRole)) throw new AppError('Only an admin can deliver without the code', 403);
    return { override: input.override_reason };
  }
  if (!input.code) throw new AppError("Enter the buyer's delivery code", 400);
  // Count the attempt before comparing, atomically, so parallel guesses cannot exceed the limit
  const counted = await query(
    `UPDATE order_shipments SET handover_attempts = handover_attempts + 1
     WHERE id = $1 AND handover_attempts < $2 RETURNING handover_attempts`, [shipmentId, MAX_ATTEMPTS]);
  if (!counted.length) throw new AppError('Too many wrong codes; ask an admin to confirm this delivery', 423);
  const expected = Buffer.from(handoverCode(s.id, s.dispatched_at));
  const given = Buffer.from(String(input.code));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    throw new AppError('Wrong delivery code', 400);
  }
  return { override: null };
}

export async function recordHandover(client: PoolClient, shipmentId: string, input: HandoverInput, override: string | null, userId: string | null) {
  await client.query(
    `UPDATE order_shipments SET received_by_name = $2, received_by_relation = $3, handover_override = $4, delivered_by = $5
     WHERE id = $1`,
    [shipmentId, input.received_by_name ?? null, input.received_by_relation ?? null, override, userId]);
}
