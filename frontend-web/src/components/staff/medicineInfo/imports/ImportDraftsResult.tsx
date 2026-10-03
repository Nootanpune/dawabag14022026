'use client';
import Link from 'next/link';
import { AlertTriangle, Download } from 'lucide-react';
import { saveTextAsFile } from '@/lib/download';
import { OUTCOME_LABEL, type ImportDraftsResult, type RowOutcome } from '@/lib/medicineInfo/imports';

const TILES: { key: RowOutcome | 'flagged'; label: string }[] = [
  { key: 'created', label: 'Drafts created' },
  { key: 'replaced', label: 'Drafts replaced' },
  { key: 'unchanged', label: 'Unchanged' },
  { key: 'already_has_information', label: 'Already has information' },
  { key: 'not_in_catalogue', label: 'Not in catalogue yet' },
  { key: 'invalid', label: 'Invalid rows' },
  { key: 'flagged', label: 'With possible claims' },
];

const tone: Record<RowOutcome, string> = {
  created: 'text-green-800', replaced: 'text-green-800', unchanged: 'text-gray-700',
  already_has_information: 'text-gray-700', not_in_catalogue: 'text-amber-800', invalid: 'text-red-700',
};

/** What the import did, row by row; the "not in catalogue yet" rows as a CSV the server built. */
export default function ImportDraftsResult({ result }: { result: ImportDraftsResult }) {
  const csvName = `not_in_catalogue_${result.partner.name.replace(/[^A-Za-z0-9]+/g, '_')}.csv`;
  return (
    <section className="space-y-3" aria-labelledby="import-result-heading" data-testid="import-result">
      <h2 id="import-result-heading" className="text-lg font-semibold text-gray-900">
        {result.partner.name}: {result.rows} rows in {result.file_name}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {TILES.map((t) => (
          <div key={t.key} className="card py-2 px-3 text-center" data-testid={`count-${t.key}`}>
            <p className="text-xl font-semibold">{result.counts[t.key]}</p>
            <p className="text-xs text-gray-600">{t.label}</p>
          </div>
        ))}
      </div>
      {result.counts.not_in_catalogue > 0 && (
        <button type="button" className="btn-outline text-sm inline-flex items-center gap-1.5"
          onClick={() => saveTextAsFile(result.not_in_catalogue_csv, csvName)}>
          <Download className="w-4 h-4" aria-hidden="true" /> Download the {result.counts.not_in_catalogue} rows not in the catalogue yet (CSV)
        </button>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr><th className="p-2">Row</th><th className="p-2">Partner item</th><th className="p-2">Result</th><th className="p-2">Dawabag product</th></tr>
          </thead>
          <tbody>
            {result.results.map((r) => (
              <tr key={r.row} className="border-t border-gray-100 align-top" data-testid="import-row">
                <td className="p-2">{r.row}</td>
                <td className="p-2">{r.item_name}<span className="block text-xs text-gray-500">{[r.pack, r.company].filter(Boolean).join(' · ')}</span></td>
                <td className={`p-2 ${tone[r.outcome]}`}>
                  <span className="font-medium">{OUTCOME_LABEL[r.outcome]}</span>
                  {r.message && <span className="block text-xs">{r.message}</span>}
                  {r.flags.length > 0 && (
                    <span className="block text-xs text-red-800 mt-1">
                      <AlertTriangle className="inline w-3.5 h-3.5 mr-0.5" aria-hidden="true" />
                      Possible prohibited claims (C-19): {r.flags.map((f) => `“${f.excerpt}”`).join('; ')}
                    </span>
                  )}
                  {r.to_fix.length > 0 && <span className="block text-xs text-gray-600 mt-1">Before sending: {r.to_fix.join('; ')}</span>}
                </td>
                <td className="p-2">
                  {r.product_id && r.product_name
                    ? <Link className="text-brand-700 underline" href={`/staff/medicine-info/${r.product_id}`}>{r.product_name}</Link>
                    : '—'}
                  {r.product_state === 'draft' && <span className="block text-xs text-gray-500">Draft product</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
