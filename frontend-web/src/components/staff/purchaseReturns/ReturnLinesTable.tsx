import type { PurchaseReturnLine } from '@/lib/purchaseReturns/types';
import { formatDateIST, formatPaise } from '@/lib/admin/format';

/** Batches on the return; the adjustment number appears once approval has taken the stock out (C-46). */
export default function ReturnLinesTable({ lines }: { lines: PurchaseReturnLine[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Batch / expiry</th>
            <th className="font-medium px-4 py-2.5 text-right">Qty</th>
            <th className="font-medium px-4 py-2.5 text-right">Unit cost</th>
            <th className="font-medium px-4 py-2.5 text-right">Taxable</th>
            <th className="font-medium px-4 py-2.5 text-right">GST</th>
            <th className="font-medium px-4 py-2.5">Stock adjustment</th>
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
                <p className="text-gray-400">{formatDateIST(l.expiry_date)}</p>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{l.quantity}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(l.unit_cost_paise)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPaise(l.taxable_paise)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                {formatPaise(l.gst_paise)}
                <p className="text-gray-400">{l.gst_rate}%</p>
              </td>
              <td className="px-4 py-2.5 text-xs">{l.adjustment_no ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
