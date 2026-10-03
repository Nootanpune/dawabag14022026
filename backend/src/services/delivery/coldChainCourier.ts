// Approved cold-chain couriers (Sprint 41; gap analysis §5.1 #17, URS-105; C-25).
// A parcel holding a refrigerated (2–8 °C) line leaves only with a courier on Dawabag's
// approved cold-chain list — the setting `delivery.cold_chain_couriers`, names separated by
// commas (e.g. "Blue Dart Cold Chain, Dawabag rider"; own riders are "Dawabag rider").
// Checked at dispatch for Dawabag's own and partners' shipments, so a courier booked through
// Shiprocket that is not on the list is caught before the parcel goes. Unset = not enforced
// yet (the admin dashboard says so), so switching it on is the owner's step.
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { getSetting } from '../settings.service';

type Q = Pick<PoolClient, 'query'>;
export const COLD_CHAIN_COURIERS_KEY = 'delivery.cold_chain_couriers';
export const COLD_CHAIN_COURIER_NOT_APPROVED = 'COLD_CHAIN_COURIER_NOT_APPROVED';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The approved names from the setting's text; [] = not enforced. */
export function approvedCouriers(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean))];
}

/** Why this courier may not take a cold-chain parcel, or null. Pure. */
export function coldChainCourierProblem(coldChain: boolean, courier: string | null | undefined, approved: string[]): string | null {
  if (!coldChain || !approved.length) return null;
  if (courier && approved.some((a) => norm(a) === norm(courier))) return null;
  return `This parcel holds a refrigerated (2–8 °C) medicine and can go only with an approved cold-chain courier: ${approved.join(', ')}. `
    + `${courier ? `"${courier}" is not on the list. ` : ''}Book one of them (an admin keeps the list in Settings).`;
}

/** Refuses (409) a cold-chain shipment's dispatch with a courier not on the approved list. */
export async function assertColdChainCourier(client: Q, shipmentId: string, courier: string | null | undefined): Promise<void> {
  const s = (await client.query(`SELECT cold_chain FROM order_shipments WHERE id = $1`, [shipmentId])).rows[0];
  if (!s?.cold_chain) return;
  const problem = coldChainCourierProblem(true, courier, approvedCouriers(await getSetting<unknown>(COLD_CHAIN_COURIERS_KEY, null, client)));
  if (problem) throw new AppError(problem, 409, true, COLD_CHAIN_COURIER_NOT_APPROVED);
}
