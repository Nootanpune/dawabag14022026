import { Snowflake, Truck } from 'lucide-react';
import type { PreviewShipment } from '@/lib/checkout';
import { formatPrice } from '@/lib/utils';
import { scheduleBadge } from '@/lib/drugSchedule';

/** One seller's part of the order: who sells, their licence, where from, when, and what (C-35, C-05, C-17). */
export default function PreviewShipmentBlock({ s }: { s: PreviewShipment }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex flex-wrap justify-between gap-2 mb-2">
        <div>
          <p className="font-medium text-sm">Sold by {s.seller_name ?? 'a Dawabag marketplace partner'}</p>
          <p className="text-xs text-gray-500">
            {s.seller_licences && s.seller_licences.length > 1 ? 'Drug licences' : 'Drug licence'} {s.seller_licence || '—'}
            {s.ships_from ? ` · ships from ${s.ships_from}` : ''}
          </p>
        </div>
        <p className="text-xs text-green-700 flex items-center gap-1">
          <Truck className="w-3.5 h-3.5" /> {s.delivery_estimate}
        </p>
      </div>
      {s.cold_chain && (
        <p className="text-xs text-blue-800 bg-blue-50 rounded p-1.5 mb-2 flex items-center gap-1">
          <Snowflake className="w-3.5 h-3.5" /> Cold-chain items travel in an insulated pack
        </p>
      )}
      <ul className="divide-y divide-gray-100">
        {s.lines.map((l) => (
          <li key={l.product_id} className="py-2 text-xs">
            <div className="flex justify-between gap-2 text-sm">
              <span className="font-medium">
                {l.product_name} × {l.quantity}
                {scheduleBadge(l.drug_schedule) && (
                  <span className="ml-1 text-xs text-red-700">({scheduleBadge(l.drug_schedule)})</span>
                )}
              </span>
              <span>{formatPrice(l.line_total_paise)}</span>
            </div>
            <p className="text-gray-500">
              {formatPrice(l.unit_price_paise)} each (MRP {formatPrice(l.mrp_paise)}) · GST {l.gst_rate}%
              {l.net_quantity ? ` · ${l.net_quantity}` : ''}
            </p>
            <p className="text-gray-400">
              {l.manufacturer ? `Mfd. by ${l.manufacturer} · ` : ''}Country of origin: {l.country_of_origin || '—'}
              {l.batch_expiry ? ` · Expiry ${l.batch_expiry} or later` : ''}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500 text-right mt-1">
        Items {formatPrice(s.subtotal_paise)} + GST {formatPrice(s.gst_paise)} = {formatPrice(s.total_paise)}
      </p>
    </div>
  );
}
