import type { EPrescriptionItem } from '@/lib/telemedicine/types';

export default function MedicineItemsTable({ items }: { items: EPrescriptionItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium py-2 pr-3">Medicine</th>
            <th className="font-medium py-2 pr-3">Dose</th>
            <th className="font-medium py-2 pr-3">How often</th>
            <th className="font-medium py-2 pr-3">Days</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={n} className="border-b border-gray-50 align-top">
              <td className="py-2 pr-3">
                <p className="font-medium">{i.medicine_name}</p>
                {i.instructions && <p className="text-xs text-gray-500">{i.instructions}</p>}
              </td>
              <td className="py-2 pr-3">{i.dosage}</td>
              <td className="py-2 pr-3">{i.frequency}</td>
              <td className="py-2 pr-3">{i.duration_days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
