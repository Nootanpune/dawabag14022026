import { MapPin, Phone } from 'lucide-react';
import type { RunStop } from '@/lib/fulfilment/types';
import { formatDateTimeIST } from '@/lib/admin/format';

/**
 * One parcel on the rider's run sheet: where, to whom, the seal and whether a
 * delivery code is due (C-26). The API sends no medicine names (C-41), and
 * riders cannot open the order, so there is no order link here.
 */
export default function RunStopCard({ stop: s, onDeliver }: { stop: RunStop; onDeliver: () => void }) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{s.deliver_to ?? '—'}</p>
          <p className="text-sm text-gray-600 flex items-start gap-1 mt-0.5">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0" /> {s.address}
          </p>
          {s.contact_mobile && (
            <a href={`tel:${s.contact_mobile}`} className="text-sm text-brand-700 flex items-center gap-1 mt-0.5">
              <Phone className="w-4 h-4" /> {s.contact_mobile}
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.cold_chain && <span className="badge-cold">Cold chain</span>}
          {s.handover_code_required && (
            <span className="text-xs font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">Delivery code needed</span>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {s.order_number}
        {s.run_ref ? ` · Run ${s.run_ref}` : ''}
        {s.seal_number ? ` · Seal ${s.seal_number}` : ''} · {s.item_lines} line(s)
        {s.dispatched_at ? ` · Out since ${formatDateTimeIST(s.dispatched_at)}` : ''}
      </p>
      {!!s.handover_attempts && (
        <p className="text-xs text-red-700 mt-1">{s.handover_attempts} wrong code attempt(s) — the pack locks after 5.</p>
      )}
      <div className="flex flex-wrap justify-end items-center gap-2 mt-3">
        <button onClick={onDeliver} className="btn-primary text-xs py-1.5 px-3">
          Mark delivered
        </button>
      </div>
    </div>
  );
}
