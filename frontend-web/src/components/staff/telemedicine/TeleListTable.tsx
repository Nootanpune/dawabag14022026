import type { AdminProductRow } from '@/lib/admin/products';
import { teleListShort } from '@/lib/telemedicine/labels';
import StatusBadge from '@/components/admin/StatusBadge';

const TONE: Record<string, string> = { O: 'verified', A: 'dispatched', B: 'pending', prohibited: 'rejected' };

export default function TeleListTable({ rows, onEdit }: { rows: AdminProductRow[]; onEdit: (p: AdminProductRow) => void }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Product</th>
            <th className="font-medium px-4 py-2.5">Schedule</th>
            <th className="font-medium px-4 py-2.5">Telemedicine list</th>
            <th className="font-medium px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-gray-50">
              <td className="px-4 py-2.5">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.sku}
                  {p.generic_name ? ` · ${p.generic_name}` : ''}
                </p>
              </td>
              <td className="px-4 py-2.5 text-xs">{p.drug_schedule ?? 'OTC'}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={p.telemedicine_list ? TONE[p.telemedicine_list] : 'draft'} label={teleListShort(p.telemedicine_list)} />
              </td>
              <td className="px-4 py-2.5 text-right">
                <button onClick={() => onEdit(p)} className="text-brand-600 hover:underline text-xs font-medium">
                  Set list
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
