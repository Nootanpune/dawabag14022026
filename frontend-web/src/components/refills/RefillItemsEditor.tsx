'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { RefillItem } from '@/lib/refills';

interface Props {
  items: RefillItem[];
  pending?: boolean;
  onSave: (items: { product_id: string; quantity: number }[]) => void;
  onCancel: () => void;
}

/** Edit quantities; 0 (or the bin) removes an item. Only changed lines are sent. */
export default function RefillItemsEditor({ items, pending, onSave, onCancel }: Props) {
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.product_id, String(i.quantity)]))
  );
  const [error, setError] = useState('');

  const save = () => {
    const changes: { product_id: string; quantity: number }[] = [];
    for (const i of items) {
      const n = Number(qty[i.product_id]);
      if (!Number.isInteger(n) || n < 0) return setError(`Enter a whole quantity for ${i.name}`);
      if (n !== i.quantity) changes.push({ product_id: i.product_id, quantity: n });
    }
    if (!changes.length) return onCancel();
    setError('');
    onSave(changes);
  };

  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.product_id} className="flex items-center gap-2 text-sm">
          <span className="flex-1 min-w-0 truncate">{i.name}</span>
          <input
            type="number"
            min={0}
            value={qty[i.product_id]}
            onChange={(e) => setQty({ ...qty, [i.product_id]: e.target.value })}
            className="input w-20"
            aria-label={`Quantity of ${i.name}`}
          />
          <button
            onClick={() => setQty({ ...qty, [i.product_id]: '0' })}
            className="p-1 text-gray-400 hover:text-red-500"
            aria-label={`Remove ${i.name}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-gray-500 px-3 py-1.5">
          Cancel
        </button>
        <button onClick={save} disabled={pending} className="btn-primary text-xs py-1.5 px-3">
          Save items
        </button>
      </div>
    </div>
  );
}
