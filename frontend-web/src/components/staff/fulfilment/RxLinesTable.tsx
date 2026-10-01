import type { RxLineDraft } from './rxForm';

/** Every prescription-only product on the order with the quantity the prescription allows (C-08). */
export default function RxLinesTable({ lines, onChange }: { lines: RxLineDraft[]; onChange: (lines: RxLineDraft[]) => void }) {
  if (!lines.length) {
    return <p className="text-xs text-gray-500">No Schedule H / H1 lines on this order still need a prescription.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
          <th className="font-medium py-1.5">Product</th>
          <th className="font-medium py-1.5 w-16 text-right">Ordered</th>
          <th className="font-medium py-1.5 w-28 text-right">Prescribed qty</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.product_id} className="border-b border-gray-50">
            <td className="py-1.5 pr-2">{l.product_name}</td>
            <td className="py-1.5 text-right">{l.ordered}</td>
            <td className="py-1.5 text-right">
              <input
                value={l.prescribed}
                onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, prescribed: e.target.value } : x)))}
                inputMode="numeric"
                className="input py-1 text-right w-24 inline-block"
                aria-label={`Prescribed quantity for ${l.product_name}`}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
