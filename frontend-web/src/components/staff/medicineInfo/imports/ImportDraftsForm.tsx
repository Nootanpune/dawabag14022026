'use client';
import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { normaliseBlobError } from '@/lib/download';
import { DRAFT_COLUMNS, downloadDraftsTemplate, draftsFileError } from '@/lib/medicineInfo/imports';
import PartnerSelect from './PartnerSelect';

interface Props {
  pending: boolean;
  onImport: (file: File, partnerId: string, replaceDrafts: boolean) => void;
}

/** Partner, workbook (kept only in React state) and the "replace unapproved drafts only" choice. */
export default function ImportDraftsForm({ pending, onImport }: Props) {
  const [partnerId, setPartnerId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const template = async () => {
    setDownloading(true);
    try { await downloadDraftsTemplate(); } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the template'));
    } finally { setDownloading(false); }
  };
  const submit = () => {
    const e = !partnerId ? 'Choose the partner' : draftsFileError(file);
    setError(e);
    if (!e) onImport(file!, partnerId, replace);
  };

  return (
    <form className="card space-y-3 text-sm" aria-label="Import medicine information drafts" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-gray-600 max-w-2xl">
          One row per partner item, on a sheet named <code>drafts</code> with the columns{' '}
          <code className="break-words">{DRAFT_COLUMNS.join(', ')}</code>. Rows are matched to Dawabag products through the chosen
          partner&apos;s own item links (item name + pack + company, as its billing export prints them).
        </p>
        <button type="button" onClick={template} disabled={downloading} className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download template
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="import-partner" className="block text-xs font-medium text-gray-700 mb-1">Partner</label>
          <PartnerSelect id="import-partner" value={partnerId} onChange={(v) => { setPartnerId(v); setError(''); }} />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-700 mb-1">Drafts workbook (.xlsx, up to 10 MB)</span>
          <label className="btn-outline text-sm cursor-pointer inline-flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> {file ? 'Change file' : 'Choose file'}
            <input type="file" data-testid="drafts-file" aria-label="Drafts workbook"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); e.target.value = ''; }} />
          </label>
          {file && <span className="ml-2 text-gray-700">{file.name} <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(0)} KB)</span></span>}
        </div>
      </div>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        <span>
          Replace unapproved drafts only
          <span className="block text-xs text-gray-500">
            A draft still being written is replaced with the file&apos;s words. Approved information and information waiting for review are never touched.
          </span>
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary text-sm inline-flex items-center gap-2">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" aria-hidden="true" />} Import drafts
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Every row becomes a draft only. Buyers see nothing until a registered pharmacist checks and sends it and a second registered pharmacist approves it (C-19).
      </p>
    </form>
  );
}
