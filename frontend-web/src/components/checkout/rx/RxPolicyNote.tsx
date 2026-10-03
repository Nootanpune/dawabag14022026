import { ShieldCheck } from 'lucide-react';

/** Same words as the server's (backend payments/rxHold/rules.ts HOLD_WORDING.checkout). */
export const CHARGE_AFTER_CHECK = "You'll only be charged after our pharmacist checks your prescription.";

/**
 * What happens to a prescription order (Sprint 39, owner decision 2026-10-03; C-08, C-37):
 * the prescription is added before payment; the payment is only AUTHORISED (held) at
 * checkout and taken after the pharmacist's check passes. If the prescription cannot be
 * accepted the buyer is told why and can send a new one; if the order cannot be supplied
 * (or nobody checks it in time) the hold is released and the buyer is never charged.
 */
export default function RxPolicyNote() {
  return (
    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 flex gap-2" data-testid="rx-charge-note">
      <ShieldCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{CHARGE_AFTER_CHECK}</p>
        <p>At payment the amount is only held on your card or UPI. Our pharmacist checks your prescription before anything is packed.</p>
        <p>If it cannot be accepted, we tell you why and you can send a new one. If the order cannot be supplied, the hold is released and you are not charged.</p>
      </div>
    </div>
  );
}
