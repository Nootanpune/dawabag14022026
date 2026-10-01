import type { OrderShipmentDetail } from '@/lib/orders/api';
import { trackingLabel } from '@/lib/orders/tracking';
import { cn } from '@/lib/utils';
import { formatDateTimeIST } from '@/lib/dates';

/** Courier scans for one shipment, newest at the top and highlighted. */
export default function ShipmentTrackingTimeline({ shipment }: { shipment: OrderShipmentDetail }) {
  const events = [...(shipment.tracking ?? [])].reverse();
  if (!events.length && !shipment.rto_at) return null;

  return (
    <div className="mt-3">
      {shipment.rto_at && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
          Returning to Dawabag — we&apos;ll contact you.
        </p>
      )}
      <ol>
        {events.map((e, i) => {
          const latest = i === 0;
          const problem = e.status === 'exception' || e.status === 'rto';
          return (
            <li key={`${e.event_time}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0',
                    latest ? (problem ? 'bg-amber-500 ring-4 ring-amber-100' : 'bg-brand-600 ring-4 ring-brand-100') : 'bg-gray-300'
                  )}
                />
                {i < events.length - 1 && <div className="w-0.5 flex-1 min-h-[1.25rem] bg-gray-100" />}
              </div>
              <div className="pb-3 min-w-0">
                <p className={cn('text-xs', latest ? 'font-semibold text-gray-900' : 'text-gray-600')}>{trackingLabel(e.status)}</p>
                <p className="text-xs text-gray-400">
                  {[e.location, formatDateTimeIST(e.event_time)].filter(Boolean).join(' · ')}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
