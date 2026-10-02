import { ShieldCheck } from 'lucide-react';

/**
 * What happens to a prescription order — the existing process, not a new policy:
 * the pharmacist checks it before anything is dispatched (C-08, rxVerification.service);
 * if it is not accepted the buyer is told why (rx_rejected notice), can send a new one
 * (rxReuse / upload put the order back in the queue) or cancel the order, and a cancelled
 * order is refunded in full to the way they paid (cancellation.service, C-37).
 */
export default function RxPolicyNote() {
  return (
    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 flex gap-2">
      <ShieldCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p>Our pharmacist checks your prescription before anything is dispatched.</p>
        <p>If it cannot be accepted, we tell you why. You can then send a new prescription, or cancel the order and get a full refund to the way you paid.</p>
      </div>
    </div>
  );
}
