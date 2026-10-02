// src/services/pharmacistCheck/rules.ts — pure rules of the pharmacist check
// (Sprint 35, owner decision 2026-10-02, Rulebook C-08): every shipment, with or
// without prescription medicines, Dawabag's own or a partner's, is checked and
// released by a registered pharmacist before it is packed or dispatched.

export const CHECK_STATES = ['pending', 'held', 'released', 'rejected', 'not_recorded'] as const;
export type CheckState = (typeof CHECK_STATES)[number];
export type CheckDecision = 'release' | 'hold' | 'reject';

/** Order states in which a shipment may be checked (paid, or on credit / trade terms, and no prescription still waiting). */
export const CHECKABLE_ORDER_STATES = ['confirmed', 'packing', 'rx_verified'];

/** Packing needs a release recorded in Sprint 35 or later. */
export function mayPack(check: string | null | undefined): boolean {
  return check === 'released';
}

/** Dispatch also lets through parcels packed before Sprint 35 (nothing was recorded then; migration 30). */
export function mayDispatch(check: string | null | undefined): boolean {
  return check === 'released' || check === 'not_recorded';
}

/** The plain reason a packer or partner sees when packing is refused. */
export function notReleasedMessage(check: string | null | undefined, note: string | null | undefined, who: 'dawabag' | 'partner'): string {
  if (check === 'held') {
    return `On hold by the pharmacist: ${note || 'no reason given'}. It cannot be packed or dispatched until the pharmacist releases it.`;
  }
  if (check === 'rejected') return 'The pharmacist declined to supply this order; it has been cancelled.';
  return who === 'partner'
    ? 'Your registered pharmacist must check this shipment and release it before it is packed or dispatched (Release for packing).'
    : 'Waiting for the pharmacist check. A registered pharmacist must release this order before it is packed or dispatched.';
}

/** Which decisions are open from a state. Released and rejected are final. */
export function canDecide(from: string, decision: CheckDecision): boolean {
  if (from !== 'pending' && from !== 'held') return false;
  return !(from === 'held' && decision === 'hold');
}

/** A hold or refusal must say why, in words a colleague (or the buyer, for a refusal) can act on. */
export function reasonProblem(decision: CheckDecision, reason: string | undefined): string | null {
  if (decision === 'release') return null;
  const r = (reason ?? '').trim();
  if (r.length < 5) return decision === 'hold' ? 'Say why the order is on hold (at least 5 characters)' : 'Say why the order cannot be supplied (at least 5 characters)';
  return null;
}

/** Summary of an order's check for the buyer: released once every live shipment is. */
export function orderCheckState(shipments: { status: string; pharmacist_check: string }[]): 'released' | 'held' | 'pending' | 'not_recorded' | 'rejected' {
  const live = shipments.filter((s) => s.status !== 'cancelled');
  if (!live.length) return shipments.some((s) => s.pharmacist_check === 'rejected') ? 'rejected' : 'not_recorded';
  if (live.some((s) => s.pharmacist_check === 'held')) return 'held';
  if (live.some((s) => s.pharmacist_check === 'pending')) return 'pending';
  if (live.every((s) => s.pharmacist_check === 'not_recorded')) return 'not_recorded';
  return 'released';
}

export interface SignalLine {
  product_name: string;
  quantity: number;
  drug_schedule: string | null;
  max_qty_per_order: number | null;
  habit_forming: boolean | null;
  /** units of the same product this buyer ordered in the last 30 days (other orders, not cancelled) */
  recent_units: number;
}

/**
 * Things the pharmacist should look at before releasing (never a block on their own):
 * a quantity at the per-order limit, a habit-forming or Schedule H1 / X / NDPS medicine,
 * or the same medicine bought again recently.
 */
export function abuseSignals(lines: SignalLine[]): { product_name: string; signal: string }[] {
  const out: { product_name: string; signal: string }[] = [];
  for (const l of lines) {
    if (l.max_qty_per_order && l.quantity >= l.max_qty_per_order) {
      out.push({ product_name: l.product_name, signal: `Quantity ${l.quantity} is at the limit per order (${l.max_qty_per_order})` });
    }
    if (l.habit_forming) out.push({ product_name: l.product_name, signal: 'Habit forming (medicine information)' });
    if (l.drug_schedule && ['Schedule H1', 'Schedule X', 'NDPS'].includes(l.drug_schedule)) {
      out.push({ product_name: l.product_name, signal: `${l.drug_schedule} medicine` });
    }
    if (l.recent_units > 0) {
      out.push({ product_name: l.product_name, signal: `Same buyer ordered ${l.recent_units} more in the last 30 days` });
    }
  }
  return out;
}
