import type { H1Entry } from '@/lib/fulfilment/types';
import { formatDateTimeIST } from '@/lib/dates';

/** Schedule H1 register rows as the server records them at dispatch (C-09). */
export default function H1RegisterTable({ entries }: { entries: H1Entry[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr className="text-left text-gray-500">
            <th className="font-medium px-3 py-2">Dispensed</th>
            <th className="font-medium px-3 py-2">Seller</th>
            <th className="font-medium px-3 py-2">Order</th>
            <th className="font-medium px-3 py-2">Product</th>
            <th className="font-medium px-3 py-2">Batch</th>
            <th className="font-medium px-3 py-2 text-right">Qty</th>
            <th className="font-medium px-3 py-2">Patient</th>
            <th className="font-medium px-3 py-2">Prescriber</th>
            <th className="font-medium px-3 py-2">Pharmacist</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((e, i) => (
            <tr key={`${e.order_number}-${e.product_name}-${e.batch_number}-${i}`} className="align-top">
              <td className="px-3 py-2 whitespace-nowrap">{formatDateTimeIST(e.dispensed_at)}</td>
              <td className="px-3 py-2">{e.seller_type === 'dawabag' ? 'Dawabag' : e.partner_name ?? 'Partner'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{e.order_number}</td>
              <td className="px-3 py-2">{e.product_name}</td>
              <td className="px-3 py-2 font-mono">{e.batch_number ?? '—'}</td>
              <td className="px-3 py-2 text-right">{e.quantity}</td>
              <td className="px-3 py-2">
                {e.patient_name ?? '—'}
                {e.patient_address && <span className="block text-gray-400">{e.patient_address}</span>}
              </td>
              <td className="px-3 py-2">
                {e.prescriber_name ?? '—'}
                {e.prescriber_reg_no && <span className="block text-gray-400">Reg {e.prescriber_reg_no}</span>}
              </td>
              <td className="px-3 py-2">
                {e.pharmacist_name ?? '—'}
                {e.pharmacist_reg_no && <span className="block text-gray-400">Reg {e.pharmacist_reg_no}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
