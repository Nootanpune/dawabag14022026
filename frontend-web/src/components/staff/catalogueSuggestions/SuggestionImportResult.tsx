'use client';
import Link from 'next/link';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { saveTextAsFile } from '@/lib/download';
import { OUTCOME_LABEL, type SuggestionImportResult as Result, type SuggestionOutcome } from '@/lib/admin/catalogueSuggestions';

const TILES: { key: SuggestionOutcome | 'flagged'; label: string }[] = [
  { key: 'attached', label: 'Suggestions added' },
  { key: 'replaced', label: 'Suggestions replaced' },
  { key: 'unchanged', label: 'Unchanged' },
  { key: 'already_in_catalogue', label: 'Already in catalogue' },
  { key: 'no_draft_yet', label: 'No draft yet' },
  { key: 'invalid', label: 'Invalid rows' },
  { key: 'flagged', label: 'With new category / HSN' },
];

const tone: Record<SuggestionOutcome, string> = {
  attached: 'text-green-800', replaced: 'text-green-800', unchanged: 'text-gray-700',
  already_in_catalogue: 'text-gray-700', no_draft_yet: 'text-amber-800', invalid: 'text-red-700',
};

/**
 * What the import did, row by row; the "no draft yet" rows as a CSV the server built. When
 * the partner asked for some of those items (open requests), an admin can create their
 * drafts here first (Sprint 29) and import the same file again.
 */
export default function SuggestionImportResult({ result, canCreateDrafts, creating, onCreateDrafts }: {
  result: Result;
  canCreateDrafts: boolean;
  creating: boolean;
  onCreateDrafts: () => void;
}) {
  const csvName = `no_draft_yet_${result.partner.name.replace(/[^A-Za-z0-9]+/g, '_')}.csv`;
  const requests = result.open_request_ids.length;
  const added = result.counts.attached + result.counts.replaced;
  return (
    <section className="space-y-3" aria-labelledby="suggestion-result-heading" data-testid="suggestion-result">
      <h2 id="suggestion-result-heading" className="text-lg font-semibold text-gray-900">
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
      <div className="flex flex-wrap gap-2">
        {added > 0 && (
          <Link href="/staff/new-products?suggested=1" className="btn-primary text-sm">Go to drafts with suggestions</Link>
        )}
        {result.counts.no_draft_yet > 0 && (
          <button type="button" className="btn-outline text-sm inline-flex items-center gap-1.5"
            onClick={() => saveTextAsFile(result.no_draft_csv, csvName)}>
            <Download className="w-4 h-4" aria-hidden="true" /> Download the {result.counts.no_draft_yet} rows with no draft yet (CSV)
          </button>
        )}
      </div>
      {result.counts.no_draft_yet > 0 && (
        <div className="card text-sm bg-amber-50 border-amber-200" data-testid="no-draft-hint">
          <p>
            Rows with no draft yet need a draft product first: an admin uses <strong>Create drafts</strong> on the partner&apos;s stock-file
            requests (<Link className="underline" href="/admin/partner-stock">Partner stock files</Link>), then imports this file again.
          </p>
          {requests > 0 && (canCreateDrafts ? (
            <button type="button" disabled={creating} onClick={onCreateDrafts}
              className="btn-primary text-sm mt-2 inline-flex items-center gap-1.5">
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create drafts for the {requests} matched request{requests === 1 ? '' : 's'}, then import again
            </button>
          ) : (
            <p className="mt-1 text-xs text-gray-700">{requests} of them {requests === 1 ? 'is a request' : 'are requests'} from the partner: ask an admin to create the drafts.</p>
          ))}
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr><th className="p-2">Row</th><th className="p-2">Partner item</th><th className="p-2">Result</th><th className="p-2">Dawabag product</th></tr>
          </thead>
          <tbody>
            {result.results.map((r) => (
              <tr key={r.row} className="border-t border-gray-100 align-top" data-testid="suggestion-row">
                <td className="p-2">{r.row}</td>
                <td className="p-2">{r.item_name}<span className="block text-xs text-gray-500">{[r.pack, r.company].filter(Boolean).join(' · ')}</span></td>
                <td className={`p-2 ${tone[r.outcome]}`}>
                  <span className="font-medium">{OUTCOME_LABEL[r.outcome]}</span>
                  {r.confidence && (r.outcome === 'attached' || r.outcome === 'replaced') && <span className="text-xs"> · {r.confidence} confidence</span>}
                  {r.message && <span className="block text-xs">{r.message}</span>}
                  {r.flags.map((f) => (
                    <span key={f.field} className="block text-xs text-amber-900 mt-1">
                      <AlertTriangle className="inline w-3.5 h-3.5 mr-0.5" aria-hidden="true" />{f.message}
                    </span>
                  ))}
                </td>
                <td className="p-2">{r.product_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
