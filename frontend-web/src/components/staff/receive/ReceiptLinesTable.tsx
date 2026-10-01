import type { ReceiptLine } from '@/lib/purchasing/types';
import { formatDateIST, formatPaise } from '@/lib/admin/format';

export default function ReceiptLinesTable({ lines }: { lines: ReceiptLine[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Batch</th>
            <th className="font-medium px-4 py-2.5 text-right">Qty + free</th>
            <th className="font-medium px-4 py-2.5 text-right">Unit cost</th>
            <th className="font-medium px-4 py-2.5 text-right">Printed MRP</th>
            <th className="font-medium px-4 py-2.5 text-right">Taxable</th>
            <th className="font-medium px-4 py-2.5 text-right">GST</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-50">
              <td className="px-4 py-2.5">
                <p className="font-medium">{l.product_name}</p>
                <p className="text-xs text-gray-400">{l.sku}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p className="font-mono">{l.batch_number}</p>
                <p className="text-gray-400">
                  Exp {formatDateIST(l.expiry_date)}
                  {l.manufactured_date && ` · Mfg ${formatDateIST(l.manufactured_date)}`}
                </p>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {l.quantity}
                {l.free_quantity ? ` + ${l.free_quantity}` : ''}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(l.unit_cost_paise)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(l.printed_mrp_paise)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(l.taxable_paise)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatPaise(l.gst_paise)}
                <span className="block text-xs text-gray-400">{l.gst_rate}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
