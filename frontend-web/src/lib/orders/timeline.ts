// Steps of the buyer's order timeline (web). Sprint 35: every order shows a
// "Pharmacist check" step — the registered pharmacist checks and releases it before
// packing (C-08); for prescription orders the prescription review is that check.
import type { OrderDetail } from './api';

export interface TimelineStep { key: string; label: string; done: boolean; active: boolean; note?: string }

const AFTER_PACKING = ['packed', 'dispatched', 'delivered', 'returned'];
const PAID_OR_CONFIRMED = ['confirmed', 'rx_pending', 'rx_verified', 'rx_rejected', 'packing', ...AFTER_PACKING];

export function orderTimeline(o: OrderDetail): TimelineStep[] {
  const s = o.status;
  const rx = o.requires_prescription && s !== 'pending_payment' && s !== 'payment_failed';
  const check = o.pharmacist_check;
  const checked = AFTER_PACKING.includes(s) || check === 'released' || (check === 'not_recorded' && s !== 'cancelled');
  const checking = !checked && ['confirmed', 'rx_verified', 'packing'].includes(s);
  const steps: TimelineStep[] = [{ key: 'placed', label: 'Order placed', done: true, active: false }];
  if (rx) {
    steps.push({
      key: 'rx', label: 'Prescription submitted', done: s !== 'rx_pending' && s !== 'rx_rejected' && PAID_OR_CONFIRMED.includes(s),
      active: s === 'rx_pending', note: s === 'rx_pending' ? 'Our pharmacist will call you to verify your prescription' : undefined,
    });
  }
  steps.push({
    key: 'check', label: 'Pharmacist check', done: checked, active: checking || s === 'rx_pending',
    note: check === 'held' ? 'Our pharmacist will contact you about this order before it is packed.'
      : checking ? 'A registered pharmacist checks every order before it is packed.' : undefined,
  });
  steps.push({ key: 'packed', label: 'Order packed', done: AFTER_PACKING.includes(s), active: false });
  steps.push({ key: 'dispatched', label: 'Dispatched', done: ['dispatched', 'delivered', 'returned'].includes(s), active: false });
  steps.push({ key: 'delivered', label: 'Delivered', done: s === 'delivered' || s === 'returned', active: false });
  if (s === 'cancelled' || s === 'rx_rejected') for (const st of steps.slice(1)) { st.active = false; }
  return steps;
}

/** "Checked by pharmacist <name>, Reg. no. <x>" for each released shipment, sellers named when more than one. */
export function pharmacistLines(o: OrderDetail): string[] {
  const released = (o.shipments ?? []).filter((x) => x.pharmacist_check === 'released' && x.pharmacist_name);
  return released.map((x) => `${released.length > 1 ? `${x.seller_name ?? 'Seller'}: ` : ''}Checked by pharmacist ${x.pharmacist_name}, Reg. no. ${x.pharmacist_reg_no}`);
}
