'use client';
import type { Batch } from '@/lib/stock/types';
import { formatDateIST, formatPaise } from '@/lib/admin/format';
import { scheduleBadge } from '@/lib/drugSchedule';
import StatusBadge from '@/components/admin/StatusBadge';

function ExpiryCell({ b }: { b: Batch }) {
  // Recalled (C-28) and expired batches are never sold; the server's allocation filters them out.
  if (b.is_recalled) return <StatusBadge status="recalled" />;
  if (b.days_to_expiry <= 0) return <StatusBadge status="expired" />;
  return <span className="text-xs text-gray-500">{b.days_to_expiry} days left</span>;
}

export default function BatchTable({ batches, onAdjust }: { batches: Batch[]; onAdjust: (b: Batch) => void }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Batch / expiry</th>
            <th className="font-medium px-4 py-2.5 text-right">Available</th>
            <th className="font-medium px-4 py-2.5 text-right">Reserved</th>
            <th className="font-medium px-4 py-2.5 text-right">Cost / MRP</th>
            <th className="font-medium px-4 py-2.5">Location</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-b border-gray-50 align-top">
              <td className="px-4 py-2.5">
                <p className="font-medium">{b.product_name}</p>
                <p className="text-xs text-gray-400">
                  {b.sku}
                  {scheduleBadge(b.drug_schedule) && ` · ${scheduleBadge(b.drug_schedule)}`}
                  {b.cold_chain && ' · cold chain'}
                  {b.supplier_name && ` · ${b.supplier_name}`}
                </p>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p className="font-mono">{b.batch_number}</p>
                <p className="text-gray-400 mb-0.5">{formatDateIST(b.expiry_date)}</p>
                <ExpiryCell b={b} />
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{b.quantity_available}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{b.quantity_reserved}</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                <p>{formatPaise(b.purchase_price_paise)}</p>
                <p className="text-gray-400">MRP {formatPaise(b.printed_mrp_paise)}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">{b.storage_location ?? '—'}</td>
              <td className="px-4 py-2.5 text-right">
                <button onClick={() => onAdjust(b)} className="btn-outline text-xs py-1 px-2.5">
                  Adjust
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
