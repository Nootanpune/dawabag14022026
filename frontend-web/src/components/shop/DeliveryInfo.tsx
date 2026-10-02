'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, MapPin, Snowflake, Truck } from 'lucide-react';
import type { ProductDetail } from '@/lib/products/api';
import { fetchDeliveryEstimate, productPageKeys } from '@/lib/shop/productPageExtras';

/**
 * "Get it by <weekday, date>" for the buyer's PIN (estimated), "Expires on or
 * after <Mon YYYY>" for the batch that would be supplied (C-27) and the
 * cold-chain note (C-25). The PIN typed here stays in this page only; signed-in
 * buyers get their saved default address's PIN from the server.
 */
export default function DeliveryInfo({ p }: { p: ProductDetail }) {
  const [pincode, setPincode] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: productPageKeys.delivery(p.id, pincode),
    queryFn: () => fetchDeliveryEstimate(p.id, pincode),
    enabled: p.in_stock && !p.cannot_order_online,
    gcTime: 0,
  });
  const askPin = editing || data?.needs_pincode;
  const save = () => {
    if (!/^[1-9]\d{5}$/.test(draft)) return;
    setPincode(draft);
    setEditing(false);
  };

  return (
    <section className="card text-sm space-y-2" aria-label="Delivery and expiry" data-testid="delivery-info">
      {p.in_stock && !p.cannot_order_online && (
        askPin ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <MapPin className="w-4 h-4 text-brand-600" aria-hidden="true" />
            <label htmlFor="eta-pin" className="text-gray-700">Delivery date for your PIN code</label>
            <input id="eta-pin" inputMode="numeric" maxLength={6} value={draft} placeholder="6-digit PIN"
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} className="input w-32 py-1" />
            <button type="submit" className="btn-outline text-xs py-1 px-3" disabled={draft.length !== 6}>Check</button>
          </form>
        ) : data ? (
          <div className="flex items-start gap-2" data-testid="delivery-eta">
            <Truck className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              {data.label ? (
                <p><span className="font-semibold text-gray-900">{data.label}</span> <span className="text-xs text-gray-500">(estimated)</span></p>
              ) : (
                <p className="text-gray-700">{data.message}</p>
              )}
              <p className="text-xs text-gray-500">
                To {data.pincode}{data.city ? ` (${data.city})` : ''}{' · '}
                <button type="button" className="text-brand-700 underline" onClick={() => { setDraft(''); setEditing(true); }}>Change PIN</button>
              </p>
            </div>
          </div>
        ) : isFetching ? <p className="text-xs text-gray-400">Checking delivery…</p> : null
      )}
      {p.expires_on_or_after && (
        <p className="flex items-center gap-2" data-testid="expiry-line">
          <CalendarCheck className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
          <span>Expires on or after <strong>{p.expires_on_or_after}</strong></span>
        </p>
      )}
      {p.cold_chain_note && (
        <p className="flex items-start gap-2 text-blue-900 bg-blue-50 rounded-lg px-2 py-1.5" data-testid="cold-chain-note">
          <Snowflake className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> {p.cold_chain_note}
        </p>
      )}
    </section>
  );
}
