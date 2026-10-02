import type { Draft } from '@/lib/admin/catalogueDrafts';
import { formatPrice } from '@/lib/utils';

/** What the partner's stock file said about the item — read-only. */
export default function FromFilePanel({ draft }: { draft: Draft }) {
  const f = draft.from_file;
  const partners = [...new Set((f.requests ?? [f]).map((r) => r.partner_name).filter(Boolean))];
  const rows: [string, string | null][] = [
    ['Name in file', f.item_name],
    ['Pack', f.pack],
    ['Company', f.company],
    ['GST', f.gst_rate != null ? `${f.gst_rate}%` : null],
    ['MRP', f.mrp_paise != null ? formatPrice(f.mrp_paise) : null],
    ['HSN in file', f.hsn_code],
    ['Asked by', partners.join(', ') || null],
  ];
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">From the partner&apos;s file</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500">{k}</dt>
            <dd className="text-gray-900 break-words">{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
