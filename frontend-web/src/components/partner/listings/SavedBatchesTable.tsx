import type { SavedBatch } from '@/lib/partner/types';
import { formatDateIST } from '@/lib/dates';

export default function SavedBatchesTable({ batches }: { batches: SavedBatch[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-gray-600 mb-1">Batches on file</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100">
            <th className="font-medium py-1.5">Batch</th>
            <th className="font-medium py-1.5 text-right">Available</th>
            <th className="font-medium py-1.5 text-right">Reserved</th>
            <th className="font-medium py-1.5">Expiry</th>
            <th className="font-medium py-1.5">Cold chain</th>
            <th className="font-medium py-1.5">Supplier</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.batch_number} className="border-b border-gray-50">
              <td className="py-1.5">{b.batch_number}</td>
              <td className="py-1.5 text-right">{b.qty_available}</td>
              <td className="py-1.5 text-right">{b.qty_reserved}</td>
              <td className="py-1.5">{formatDateIST(b.expiry_date)}</td>
              <td className="py-1.5">{b.cold_chain_confirmed ? 'Confirmed' : '—'}</td>
              <td className="py-1.5">{b.supplier_name ? `${b.supplier_name}${b.supplier_invoice_no ? ` · ${b.supplier_invoice_no}` : ''}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
