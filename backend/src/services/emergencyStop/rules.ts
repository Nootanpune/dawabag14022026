// Emergency stop for prescription-medicine sales (owner decision 2026-10-03; Sprint 38).
// Not a legal lock: sales are OPEN by default. A super-admin may pause them at once —
// for example on a government notification — with a reason and a reference, and
// resume them with one click; both are audited (C-08, C-46). Pure rules, unit-tested.
//
// What a pause covers: lines that need a prescription for this buyer — Schedule H / H1
// for retail buyers (requiresPrescription; licensed trade buyers are not covered), from
// Dawabag and from every partner.
// While paused (developer's choice, recorded in DECISIONS.md):
//   * such medicines cannot be added to the cart (or increased), and a cart holding them
//     cannot be checked out or paid for — the buyer gets a plain message, not an error page;
//   * orders already paid are HELD, not cancelled: the pharmacist may still verify, check
//     and pack them, but no parcel holding such a line is dispatched (Dawabag's or a
//     partner's) until sales resume — or staff cancel and refund the order;
//   * everything else (other medicines, delivery of parcels already dispatched) goes on.
import { BuyerType, requiresPrescription } from '../../utils/customerType';

export interface RxPauseState {
  paused: boolean;
  reason?: string;              // internal, staff only
  reference?: string;           // e.g. the notification number; shown publicly
  public_message?: string | null;
  paused_by?: string;
  paused_at?: string;
}

export const DEFAULT_PUBLIC_MESSAGE =
  'Orders for prescription medicines are paused for now. You can still order other products.';

export function parsePauseState(value: unknown): RxPauseState {
  if (!value || typeof value !== 'object') return { paused: false };
  const v = value as Record<string, unknown>;
  if (v.paused !== true) return { paused: false };
  const s = (k: string) => (typeof v[k] === 'string' && (v[k] as string).trim() ? (v[k] as string).trim() : undefined);
  return { paused: true, reason: s('reason'), reference: s('reference'), public_message: s('public_message') ?? null,
    paused_by: s('paused_by'), paused_at: s('paused_at') };
}

export const isPausedLine = (state: RxPauseState, buyer: BuyerType, schedule: string | null | undefined) =>
  state.paused && requiresPrescription(buyer, schedule);

/** What a buyer reads (cart, checkout, banner). */
export function customerMessage(state: RxPauseState): string {
  const base = state.public_message || DEFAULT_PUBLIC_MESSAGE;
  return state.reference ? `${base} (Reference: ${state.reference})` : base;
}

/** Cart line note while paused. */
export const PAUSED_LINE_ISSUE = 'Prescription medicines are paused for now';

/** The refusal at checkout / payment, naming the medicines. */
export function checkoutMessage(state: RxPauseState, names: string[]): string {
  return `${customerMessage(state)} Please remove ${names.join(', ')} from your cart to order the rest.`;
}

/** What staff and partners read when they try to dispatch a held parcel. */
export function dispatchHeldMessage(state: RxPauseState, names: string[]): string {
  return `Prescription-medicine sales are paused by Dawabag${state.reference ? ` (reference ${state.reference})` : ''}. `
    + `Keep this parcel: it holds ${names.join(', ')} and may not be dispatched until sales resume. `
    + 'You can still finish the pharmacist check and packing; Dawabag will tell you when to dispatch, or cancel and refund the order.';
}

/** The public status (web and app banner): nothing internal. */
export function publicStatus(state: RxPauseState) {
  return state.paused
    ? { rx_sales: 'paused' as const, message: customerMessage(state), reference: state.reference ?? null, since: state.paused_at ?? null }
    : { rx_sales: 'open' as const, message: null, reference: null, since: null };
}
