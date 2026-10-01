import { cellTone, columnLabel, formatCell, type ReportRow } from '@/lib/admin/accounts';

/** Generic table for any accounts report; amount columns (…_paise) shown in ₹. */
export default function ReportTable({ report, rows }: { report: string; rows: ReportRow[] }) {
  const columns = Object.keys(rows[0] ?? {});
  return (
    <div className="card overflow-x-auto p-0 max-h-[600px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-gray-100 text-left text-gray-400">
            {columns.map((c) => (
              <th key={c} className={`font-medium px-3 py-2 whitespace-nowrap ${c.endsWith('_paise') ? 'text-right' : ''}`}>
                {columnLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50">
              {columns.map((c) => {
                const tone = cellTone(report, c, r[c]);
                return (
                  <td key={c} className={`px-3 py-1.5 whitespace-nowrap ${c.endsWith('_paise') ? 'text-right tabular-nums' : ''}`}>
                    {tone ? (
                      <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${tone}`}>{formatCell(c, r[c]).replace(/_/g, ' ')}</span>
                    ) : (
                      formatCell(c, r[c])
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
