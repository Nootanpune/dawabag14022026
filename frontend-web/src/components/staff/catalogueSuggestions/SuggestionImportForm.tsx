'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { normaliseBlobError } from '@/lib/download';
import {
  SUGGESTION_COLUMNS, downloadSuggestionsTemplate, fetchSuggestionFormat, suggestionKeys, suggestionsFileError,
} from '@/lib/admin/catalogueSuggestions';
import PartnerSelect from '@/components/staff/medicineInfo/imports/PartnerSelect';

interface Props {
  pending: boolean;
  onImport: (file: File, partnerId: string) => void;
}

/** Partner and workbook (kept only in React state); the accepted values come from the server. */
export default function SuggestionImportForm({ pending, onImport }: Props) {
  const [partnerId, setPartnerId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const format = useQuery({ queryKey: suggestionKeys.format, queryFn: fetchSuggestionFormat, staleTime: 300_000 });

  const template = async () => {
    setDownloading(true);
    try { await downloadSuggestionsTemplate(); } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the template'));
    } finally { setDownloading(false); }
  };
  const submit = () => {
    const e = !partnerId ? 'Choose the partner' : suggestionsFileError(file);
    setError(e);
    if (!e) onImport(file!, partnerId);
  };
  const allowed = format.data?.allowed;

  return (
    <form className="card space-y-3 text-sm" aria-label="Import catalogue suggestions" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-gray-600 max-w-2xl">
          One row per partner item, on a sheet named <code>suggestions</code> with the columns{' '}
          <code className="break-words">{SUGGESTION_COLUMNS.join(', ')}</code>. A row is used only for the chosen partner&apos;s item that
          is linked to a <strong>draft</strong> product; live products are never changed.
        </p>
        <button type="button" onClick={template} disabled={downloading} className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download template
        </button>
      </div>
      {allowed && (
        <details className="text-xs text-gray-700" data-testid="suggestion-allowed-values">
          <summary className="cursor-pointer font-medium">Accepted values</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="font-medium">drug_schedule</dt><dd>{allowed.drug_schedule.join(', ')} (also H, H1, G, X)</dd>
            <dt className="font-medium">dosage_form</dt><dd>{allowed.dosage_form.join(', ')}</dd>
            <dt className="font-medium">product_class</dt><dd>{allowed.product_class.join(', ')}</dd>
            <dt className="font-medium">gst_rate</dt><dd>{allowed.gst_rate.join(', ')}</dd>
            <dt className="font-medium">cold_chain, is_new_drug</dt><dd>yes or no</dd>
            <dt className="font-medium">hsn_code</dt><dd>4, 6 or 8 digits (a code not in the HSN list is flagged)</dd>
            <dt className="font-medium">category</dt><dd>text (a category not in the list is flagged)</dd>
            <dt className="font-medium">confidence</dt><dd>{allowed.confidence.join(', ')} (required)</dd>
          </dl>
        </details>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="suggestion-partner" className="block text-xs font-medium text-gray-700 mb-1">Partner</label>
          <PartnerSelect id="suggestion-partner" value={partnerId} onChange={(v) => { setPartnerId(v); setError(''); }} />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-700 mb-1">Suggestions workbook (.xlsx, up to 10 MB)</span>
          <label className="btn-outline text-sm cursor-pointer inline-flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> {file ? 'Change file' : 'Choose file'}
            <input type="file" data-testid="suggestions-file" aria-label="Suggestions workbook"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); e.target.value = ''; }} />
          </label>
          {file && <span className="ml-2 text-gray-700">{file.name} <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(0)} KB)</span></span>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary text-sm inline-flex items-center gap-2">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" aria-hidden="true" />} Import suggestions
        </button>
      </div>
      <p className="text-xs text-gray-500">
        A suggestion is never a decision: it is shown on the product&apos;s form as &ldquo;Suggested — check against the pack&rdquo;, and a pharmacist
        decides and approves every product one at a time (C-10, C-19).
      </p>
    </form>
  );
}
