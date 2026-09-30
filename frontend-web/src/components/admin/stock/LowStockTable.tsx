import type { LowStockProduct } from '@/lib/admin/stock';
import { formatDateTimeIST } from '@/lib/admin/format';
import StatusBadge from '../StatusBadge';

export default function LowStockTable({ products }: { products: LowStockProduct[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Category</th>
            <th className="font-medium px-4 py-2.5 text-right">Stock</th>
            <th className="font-medium px-4 py-2.5 text-right">Reorder level</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5">Preferred vendor</th>
            <th className="font-medium px-4 py-2.5">Last alert</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-gray-50">
              <td className="px-4 py-2.5">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-gray-400">{p.sku}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">{p.category ?? '—'}</td>
              <td className="px-4 py-2.5 text-right font-medium">{String(p.current_stock)}</td>
              <td className="px-4 py-2.5 text-right text-gray-500">{p.reorder_level_qty}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={p.stock_status} label={p.stock_status} />
              </td>
              <td className="px-4 py-2.5 text-xs">{p.preferred_vendor_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-xs text-gray-500">{formatDateTimeIST(p.last_alert_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
