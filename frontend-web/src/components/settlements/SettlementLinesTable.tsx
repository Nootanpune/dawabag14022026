import type { SettlementLine } from '@/lib/marketplace/settlement';
import { formatPrice } from '@/lib/utils';
import { formatDateIST } from '@/lib/dates';

export default function SettlementLinesTable({ lines }: { lines: SettlementLine[] }) {
  if (!lines.length) return <p className="text-sm text-gray-400 py-4">No lines in this batch.</p>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Order / invoice</th>
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5 text-right">Qty</th>
            <th className="font-medium px-4 py-2.5 text-right">Value</th>
            <th className="font-medium px-4 py-2.5 text-right">GST</th>
            <th className="font-medium px-4 py-2.5 text-right">Commission</th>
            <th className="font-medium px-4 py-2.5">Delivered</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-50">
              <td className="px-4 py-2.5 text-xs">
                <p className="font-medium text-sm">{l.order_number}</p>
                <p className="text-gray-400">{l.partner_invoice_number ?? '—'}</p>
              </td>
              <td className="px-4 py-2.5">{l.product_name}</td>
              <td className="px-4 py-2.5 text-right">{l.allocated_qty}</td>
              <td className="px-4 py-2.5 text-right">{formatPrice(l.line_value_paise)}</td>
              <td className="px-4 py-2.5 text-right">{formatPrice(l.line_gst_paise)}</td>
              <td className="px-4 py-2.5 text-right">
                {formatPrice(l.commission_paise)} <span className="text-xs text-gray-400">({l.commission_pct}%)</span>
              </td>
              <td className="px-4 py-2.5 text-xs">{formatDateIST(l.delivered_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
