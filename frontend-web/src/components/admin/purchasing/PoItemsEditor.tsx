'use client';
import { Trash2 } from 'lucide-react';
import CatalogueSearch from './CatalogueSearch';

export interface PoItemDraft {
  product_id: string;
  name: string;
  sku: string;
  quantity: string;
  unit_cost: string;
}

interface Props {
  items: PoItemDraft[];
  onChange: (items: PoItemDraft[]) => void;
}

/** Lines of a new PO: each product once, quantity in units, cost in rupees (sent as paise). */
export default function PoItemsEditor({ items, onChange }: Props) {
  const set = (i: number, patch: Partial<PoItemDraft>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-3">
      {!!items.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="font-medium py-2">Product</th>
                <th className="font-medium py-2 w-28">Quantity</th>
                <th className="font-medium py-2 w-36">Unit cost (₹, excl. GST)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.product_id} className="border-b border-gray-50">
                  <td className="py-2 pr-2">
                    <p className="font-medium">{it.name}</p>
                    <p className="text-xs text-gray-400">{it.sku}</p>
                  </td>
                  <td className="py-2 pr-2">
                    <input value={it.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="numeric" className="input" />
                  </td>
                  <td className="py-2 pr-2">
                    <input value={it.unit_cost} onChange={(e) => set(i, { unit_cost: e.target.value })} inputMode="decimal" className="input" />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => onChange(items.filter((_, j) => j !== i))}
                      className="p-1.5 text-gray-400 hover:text-red-600"
                      aria-label={`Remove ${it.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CatalogueSearch
        taken={items.map((i) => i.product_id)}
        onPick={(p) => onChange([...items, { product_id: p.id, name: p.name, sku: p.sku, quantity: '', unit_cost: '' }])}
      />
    </div>
  );
}
