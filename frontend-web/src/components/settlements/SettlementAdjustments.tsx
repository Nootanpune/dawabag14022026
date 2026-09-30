import type { SettlementAdjustment } from '@/lib/marketplace/settlement';
import { formatDateIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';

const signed = (p: number) => (p < 0 ? `– ${formatPrice(-p)}` : formatPrice(p));

/** Return credit notes deducted in this settlement (C-37). Values are negative, as the server sends them. */
export default function SettlementAdjustments({ rows }: { rows: SettlementAdjustment[] }) {
  const total = rows.reduce((s, a) => s + Number(a.taxable_paise) + Number(a.gst_paise), 0);
  return (
    <div>
      <h3 className="font-semibold text-sm mb-2">Return adjustments ({rows.length})</h3>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr className="text-left">
              <th className="font-medium px-3 py-2">Reason</th>
              <th className="font-medium px-3 py-2">Credit note</th>
              <th className="font-medium px-3 py-2 text-right">Taxable</th>
              <th className="font-medium px-3 py-2 text-right">GST</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  {a.reason}
                  <span className="text-gray-400"> · {formatDateIST(a.created_at)}</span>
                </td>
                <td className="px-3 py-2 font-mono">{a.credit_note_number ?? '—'}</td>
                <td className="px-3 py-2 text-right text-red-600">{signed(Number(a.taxable_paise))}</td>
                <td className="px-3 py-2 text-right text-red-600">{signed(Number(a.gst_paise))}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Total deducted
              </td>
              <td className="px-3 py-2 text-right text-red-600" colSpan={2}>
                {signed(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
