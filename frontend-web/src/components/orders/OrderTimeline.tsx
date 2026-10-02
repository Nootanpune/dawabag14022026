import { ExternalLink } from 'lucide-react';
import type { OrderDetail } from '@/lib/orders/api';

const TIMELINE_STEPS = [
  { status: 'pending_payment', label: 'Order placed' },
  { status: 'rx_pending', label: 'Prescription submitted' },
  { status: 'rx_verified', label: 'Prescription verified' },
  { status: 'packed', label: 'Order packed' },
  { status: 'dispatched', label: 'Dispatched' },
  { status: 'delivered', label: 'Delivered' },
];

const STATUS_ORDER = ['pending_payment', 'rx_pending', 'rx_verified', 'packing', 'packed', 'dispatched', 'delivered'];

export default function OrderTimeline({ order }: { order: OrderDetail }) {
  const currentIdx = STATUS_ORDER.indexOf(order.status);
  // Prescription steps only for orders that need a prescription (C-08); an OTC order never goes through them
  const steps = TIMELINE_STEPS.filter(
    (s) => !['rx_pending', 'rx_verified'].includes(s.status) || (order.requires_prescription && order.status !== 'pending_payment')
  );
  return (
    <div className="card mb-4">
      <h3 className="font-semibold text-sm mb-4">Order timeline</h3>
      {steps.map((step, i) => {
        const done = currentIdx >= STATUS_ORDER.indexOf(step.status) && order.status !== 'rx_rejected';
        const active = STATUS_ORDER[currentIdx] === step.status;
        return (
          <div key={step.status} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mt-1 ${
                  done ? 'bg-brand-600 border-brand-600' : active ? 'bg-brand-200 border-brand-400' : 'bg-white border-gray-300'
                }`}
              />
              {i < steps.length - 1 && <div className={`w-0.5 flex-1 min-h-[1.5rem] ${done ? 'bg-brand-200' : 'bg-gray-100'}`} />}
            </div>
            <div className="pb-4">
              <p className={`text-sm font-medium ${done ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</p>
              {step.status === 'rx_pending' && order.status === 'rx_pending' && (
                <p className="text-xs text-amber-600 mt-0.5">Our pharmacist will call you to verify your prescription</p>
              )}
              {step.status === 'dispatched' && order.awb_number && (
                <div className="mt-1">
                  <p className="text-xs text-gray-500">
                    {order.courier_partner} · {order.awb_number}
                  </p>
                  {order.tracking_url && (
                    <a
                      href={order.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-0.5"
                    >
                      Track shipment <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
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
