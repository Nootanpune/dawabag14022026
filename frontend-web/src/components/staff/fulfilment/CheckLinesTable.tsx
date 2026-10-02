import type { CheckLine } from '@/lib/fulfilment/types';

/** The medicines and quantities the pharmacist checks. */
export default function CheckLinesTable({ lines }: { lines: CheckLine[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-600 border-b border-gray-100">
          <th className="font-medium py-1">Medicine</th>
          <th className="font-medium py-1">Schedule</th>
          <th className="font-medium py-1 text-right">Qty</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.order_item_id} className="border-b border-gray-50">
            <td className="py-1 pr-2">{l.product_name}</td>
            <td className="py-1 pr-2">{l.drug_schedule ?? '—'}{l.prescription_verified ? ' · prescription verified' : ''}</td>
            <td className="py-1 text-right">{l.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
