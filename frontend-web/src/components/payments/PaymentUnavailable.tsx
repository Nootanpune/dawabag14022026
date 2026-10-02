import { AlertCircle } from 'lucide-react';

/** No way to pay online on this server right now (never a raw error). */
export default function PaymentUnavailable({ what = 'Your order is saved.' }: { what?: string }) {
  return (
    <div role="status" className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900 flex gap-2">
      <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
      <p><strong>Online payment is not available right now.</strong> {what} Please try again later, or contact us using
        the details at the bottom of the page.</p>
    </div>
  );
}
