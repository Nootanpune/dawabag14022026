import type { PoItem } from '@/lib/purchasing/types';
import { formatPaise } from '@/lib/admin/format';

export default function PoItemsTable({ items }: { items: PoItem[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5 text-right">Ordered</th>
            <th className="font-medium px-4 py-2.5 text-right">Received</th>
            <th className="font-medium px-4 py-2.5 text-right">Due</th>
            <th className="font-medium px-4 py-2.5 text-right">Unit cost</th>
            <th className="font-medium px-4 py-2.5 text-right">GST</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-50">
              <td className="px-4 py-2.5">
                <p className="font-medium">{it.product_name}</p>
                <p className="text-xs text-gray-400">{it.sku}</p>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{it.quantity}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{it.received_qty}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{Math.max(0, it.quantity - it.received_qty)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(it.unit_cost_paise)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{it.gst_rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
