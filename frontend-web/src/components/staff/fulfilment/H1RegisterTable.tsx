import type { H1Entry } from '@/lib/fulfilment/types';
import { formatDateTimeIST } from '@/lib/dates';

/** Register number as people read it: "Licence MH-20-1 · No. 12"; rows from before Sprint 38 have no number. */
function entryLabel(e: H1Entry) {
  if (e.chain_legacy || e.entry_no == null) return 'Before Sprint 38';
  return `${e.seller_licence_no ? `Licence ${e.seller_licence_no} · ` : ''}No. ${e.entry_no}`;
}

/** Schedule H1 register rows as the server records them at dispatch (C-09), numbered per seller licence. */
export default function H1RegisterTable({ entries }: { entries: H1Entry[] }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr className="text-left text-gray-500">
            <th className="font-medium px-3 py-2">Register entry</th>
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
            <tr key={`${e.register_key ?? 'legacy'}-${e.entry_no ?? i}-${e.order_number}-${i}`} className="align-top">
              <td className="px-3 py-2 whitespace-nowrap">{entryLabel(e)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDateTimeIST(e.dispensed_at)}</td>
              <td className="px-3 py-2">{e.seller_type === 'dawabag' ? 'Dawabag' : e.partner_name ?? 'Partner'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{e.order_number}</td>
              <td className="px-3 py-2">{e.product_name}</td>
              <td className="px-3 py-2 font-mono">{e.batch_number ?? '—'}</td>
              <td className="px-3 py-2 text-right">{e.quantity}</td>
              <td className="px-3 py-2">
                {e.patient_name ?? '—'}
                {e.patient_address && <span className="block text-gray-500">{e.patient_address}</span>}
              </td>
              <td className="px-3 py-2">
                {e.prescriber_name ?? '—'}
                {e.prescriber_address && <span className="block text-gray-500">{e.prescriber_address}</span>}
                {e.prescriber_reg_no && <span className="block text-gray-500">Reg {e.prescriber_reg_no}</span>}
              </td>
              <td className="px-3 py-2">
                {e.pharmacist_name ?? '—'}
                {e.pharmacist_reg_no && <span className="block text-gray-500">Reg {e.pharmacist_reg_no}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
