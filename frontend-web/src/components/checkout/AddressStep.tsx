'use client';
import { useState } from 'react';
import { Loader2, MapPin, ChevronRight } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { Address } from '@/lib/addresses';
import type { CartView } from '@/lib/cart';
import AddressSummary from '@/components/addresses/AddressSummary';
import AddressFormDialog from '@/components/addresses/AddressFormDialog';

interface Props {
  addresses: Address[] | undefined;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  cart: CartView;
  onContinue: () => void;
}

export default function AddressStep({ addresses, loading, selectedId, onSelect, cart, onContinue }: Props) {
  const [adding, setAdding] = useState(false);
  const selected = addresses?.find((a) => a.id === selectedId);
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-brand-600" /> Delivery address
      </h2>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="space-y-3">
          {(addresses ?? []).map((addr) => (
            <label
              key={addr.id}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors
                ${selectedId === addr.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <input
                type="radio"
                name="address"
                value={addr.id}
                checked={selectedId === addr.id}
                onChange={() => onSelect(addr.id)}
                className="mt-1 accent-brand-600"
              />
              <AddressSummary a={addr} />
            </label>
          ))}
          {(!addresses || addresses.length === 0) && (
            <p className="text-center text-gray-400 py-4 text-sm">No saved addresses yet.</p>
          )}
          <button
            onClick={() => setAdding(true)}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600"
          >
            + Add new address
          </button>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-gray-100 text-sm space-y-1">
        <div className="flex justify-between text-gray-600">
          <span>Cart subtotal ({cart.item_count} items)</span>
          <span>{formatPrice(cart.subtotal_paise)}</span>
        </div>
        {cart.discount_paise > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>–{formatPrice(cart.discount_paise)}</span>
          </div>
        )}
        <p className="text-xs text-gray-400">GST and delivery for this address are shown on the next step, before you pay.</p>
      </div>

      <button
        onClick={onContinue}
        disabled={!selected || selected.is_serviceable === false}
        className="btn-primary w-full mt-5 py-3 flex items-center justify-center gap-2"
      >
        Review order <ChevronRight className="w-4 h-4" />
      </button>
      {adding && <AddressFormDialog onClose={() => setAdding(false)} onSaved={(a) => onSelect(a.id)} />}
    </div>
  );
}
