import type { ShipmentLine } from '@/lib/partner/types';
import { formatPrice } from '@/lib/utils';
import { formatDateIST } from '@/lib/dates';

export default function ShipmentLines({ lines }: { lines: ShipmentLine[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-100">
          <th className="font-medium py-1.5">Item</th>
          <th className="font-medium py-1.5 text-right">Qty</th>
          <th className="font-medium py-1.5">Batch</th>
          <th className="font-medium py-1.5">Expiry</th>
          <th className="font-medium py-1.5 text-right">Unit price</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={`${l.sku}-${l.batch_number}-${i}`} className="border-b border-gray-50">
            <td className="py-1.5">
              {l.product_name} <span className="text-gray-400">· {l.sku}</span>
            </td>
            <td className="py-1.5 text-right">{l.quantity}</td>
            <td className="py-1.5">{l.batch_number ?? '—'}</td>
            <td className="py-1.5">{formatDateIST(l.expiry_date)}</td>
            <td className="py-1.5 text-right">
              {formatPrice(l.unit_price_paise)} <span className="text-gray-400">+{l.gst_rate}% GST</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
