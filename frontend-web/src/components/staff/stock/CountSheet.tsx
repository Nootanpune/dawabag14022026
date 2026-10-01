'use client';
import type { CountLine } from '@/lib/stock/types';
import { formatDateIST } from '@/lib/admin/format';

interface Props {
  lines: CountLine[];
  /** typed quantities while the count is open (in memory only) */
  values: Record<string, string>;
  onChange?: (batchId: string, value: string) => void;
  /** blind count: the counter does not see system quantities until submitted */
  showSystem: boolean;
}

export default function CountSheet({ lines, values, onChange, showSystem }: Props) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Location</th>
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Batch</th>
            {showSystem && <th className="font-medium px-4 py-2.5 text-right">System</th>}
            <th className="font-medium px-4 py-2.5 text-right w-32">Counted</th>
            {showSystem && <th className="font-medium px-4 py-2.5 text-right">Variance</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const counted = onChange ? values[l.batch_id] ?? '' : l.counted_qty == null ? '' : String(l.counted_qty);
            const variance = counted !== '' ? Number(counted) - l.system_qty : null;
            return (
              <tr key={l.batch_id} className="border-b border-gray-50">
                <td className="px-4 py-2 text-xs">{l.storage_location ?? '—'}</td>
                <td className="px-4 py-2">
                  <p className="font-medium">{l.product_name}</p>
                  <p className="text-xs text-gray-400">{l.sku}</p>
                </td>
                <td className="px-4 py-2 text-xs">
                  <p className="font-mono">{l.batch_number}</p>
                  <p className="text-gray-400">{formatDateIST(l.expiry_date)}</p>
                </td>
                {showSystem && <td className="px-4 py-2 text-right tabular-nums">{l.system_qty}</td>}
                <td className="px-4 py-2 text-right">
                  {onChange ? (
                    <input
                      value={counted}
                      onChange={(e) => onChange(l.batch_id, e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      className="input text-right"
                      aria-label={`Counted ${l.product_name} ${l.batch_number}`}
                    />
                  ) : (
                    <span className="tabular-nums">{counted || '—'}</span>
                  )}
                </td>
                {showSystem && (
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      variance ? (variance < 0 ? 'text-red-700' : 'text-green-700') : 'text-gray-400'
                    }`}
                  >
                    {variance == null ? '—' : variance > 0 ? `+${variance}` : variance}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
