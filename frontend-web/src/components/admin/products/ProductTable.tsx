import Link from 'next/link';
import type { AdminProductRow } from '@/lib/admin/products';
import { formatPrice } from '@/lib/utils';
import { scheduleBadge } from '@/lib/drugSchedule';

export default function ProductTable({ products }: { products: AdminProductRow[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Category</th>
            <th className="font-medium px-4 py-2.5">Schedule</th>
            <th className="font-medium px-4 py-2.5 text-right">MRP</th>
            <th className="font-medium px-4 py-2.5 text-right">Patient price</th>
            <th className="font-medium px-4 py-2.5 text-right">Stock</th>
            <th className="font-medium px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-gray-50">
              <td className="px-4 py-2.5">
                <p className="font-medium">
                  {p.name} {p.cold_chain && <span className="badge-cold ml-1">Cold chain</span>}
                </p>
                <p className="text-xs text-gray-400">
                  {p.sku}
                  {p.generic_name ? ` · ${p.generic_name}` : ''}
                </p>
              </td>
              <td className="px-4 py-2.5 text-xs">{p.category ?? '—'}</td>
              <td className="px-4 py-2.5 text-xs">{scheduleBadge(p.drug_schedule) ?? 'OTC'}</td>
              <td className="px-4 py-2.5 text-right">{formatPrice(Number(p.mrp_paise))}</td>
              <td className="px-4 py-2.5 text-right">{formatPrice(Number(p.offer_price_paise))}</td>
              <td className="px-4 py-2.5 text-right">{String(p.stock_qty)}</td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/admin/products/${p.id}`} className="text-brand-600 hover:underline text-xs font-medium">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
