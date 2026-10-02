import { ExternalLink, UserCheck } from 'lucide-react';
import type { OrderDetail } from '@/lib/orders/api';
import { orderTimeline, pharmacistLines } from '@/lib/orders/timeline';

/** Order progress for the buyer. Sprint 35: every order shows its "Pharmacist check" (C-08). */
export default function OrderTimeline({ order }: { order: OrderDetail }) {
  const steps = orderTimeline(order);
  const checkedBy = pharmacistLines(order);
  return (
    <div className="card mb-4">
      <h3 className="font-semibold text-sm mb-4">Order timeline</h3>
      <ol>
        {steps.map((step, i) => (
          <li key={step.key} className="flex gap-4" aria-current={step.active ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mt-1 ${
                  step.done ? 'bg-brand-600 border-brand-600' : step.active ? 'bg-brand-200 border-brand-500' : 'bg-white border-gray-300'
                }`}
              />
              {i < steps.length - 1 && <div className={`w-0.5 flex-1 min-h-[1.5rem] ${step.done ? 'bg-brand-200' : 'bg-gray-100'}`} />}
            </div>
            <div className="pb-4">
              <p className={`text-sm font-medium ${step.done || step.active ? 'text-gray-800' : 'text-gray-500'}`}>
                {step.label}
                <span className="sr-only">{step.done ? ' (done)' : step.active ? ' (in progress)' : ''}</span>
              </p>
              {step.note && <p className="text-xs text-amber-800 mt-0.5">{step.note}</p>}
              {step.key === 'check' && checkedBy.map((l) => (
                <p key={l} className="text-xs text-gray-700 mt-0.5 flex items-center gap-1" data-testid="checked-by">
                  <UserCheck className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" /> {l}
                </p>
              ))}
              {step.key === 'dispatched' && order.awb_number && (
                <div className="mt-1">
                  <p className="text-xs text-gray-600">
                    {order.courier_partner} · {order.awb_number}
                  </p>
                  {order.tracking_url && (
                    <a href={order.tracking_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-brand-700 hover:underline flex items-center gap-1 mt-0.5">
                      Track shipment <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {order.pharmacist_check === 'rejected' && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Our pharmacist could not supply this order, so it has been cancelled and refunded to the way you paid.
        </div>
      )}
      {order.status === 'rx_rejected' && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {/* The order stays open (rxVerification.service): a new prescription puts it back in the
              pharmacist's queue (C-08); cancelling refunds what was paid (cancellation.service, C-37) */}
          Our pharmacist could not accept the prescription for this order. Please upload a new prescription
          from your Prescriptions page, or cancel the order for a full refund to the way you paid.
        </div>
      )}
    </div>
  );
}
