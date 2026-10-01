import type { RecallAffected } from '@/lib/recalls/api';
import StatusBadge from '@/components/admin/StatusBadge';

/** Orders that contain the recalled batch (C-28). */
export default function AffectedOrdersTable({ rows }: { rows: RecallAffected[] }) {
  if (!rows.length) return <p className="text-sm text-gray-400 py-6 text-center">No orders contain this batch.</p>;
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">Order</th>
            <th className="font-medium px-4 py-2.5">Buyer</th>
            <th className="font-medium px-4 py-2.5 text-right">Qty</th>
            <th className="font-medium px-4 py-2.5">Seller</th>
            <th className="font-medium px-4 py-2.5">Order status</th>
            <th className="font-medium px-4 py-2.5">Shipment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((a) => (
            <tr key={a.order_item_id ?? `${a.order_id}-${a.quantity}`}>
              <td className="px-4 py-2.5 whitespace-nowrap">{a.order_number}</td>
              <td className="px-4 py-2.5">{a.buyer_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-right">{a.quantity}</td>
              <td className="px-4 py-2.5 text-xs">{a.seller_type === 'partner' ? 'Partner' : a.seller_type === 'dawabag' ? 'Dawabag' : '—'}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={a.order_status} />
              </td>
              <td className="px-4 py-2.5">{a.shipment_status ? <StatusBadge status={a.shipment_status} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
