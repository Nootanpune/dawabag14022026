'use client';
import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCatalogueTemplate } from '@/lib/admin/catalogueImport';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { normaliseBlobError } from '@/lib/download';

interface Props {
  file: File | null;
  onFile: (f: File | null) => void;
  onPreview: () => void;
  pending: boolean;
}

/** Template download + file chooser. The File lives only in React state. */
export default function ImportFilePicker({ file, onFile, onPreview, pending }: Props) {
  const [downloading, setDownloading] = useState(false);
  const template = async () => {
    setDownloading(true);
    try {
      await downloadCatalogueTemplate();
    } catch (err) {
      toast.error(getApiErrorMessage(await normaliseBlobError(err), 'Could not download the template'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-gray-600">Fill in the Dawabag template (products sheet and opening stock sheet), then upload it here.</p>
        <button onClick={template} disabled={downloading} className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Template (.xlsx)
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-outline text-sm cursor-pointer inline-flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> {file ? 'Change file' : 'Choose file'}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </label>
        {file && (
          <span className="text-gray-700">
            {file.name} <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
          </span>
        )}
        <button onClick={onPreview} disabled={!file || pending} className="btn-primary text-sm inline-flex items-center gap-2 ml-auto">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />} Check file
        </button>
      </div>
      <p className="text-xs text-gray-400">.xlsx up to 5 MB and 5,000 rows. Nothing is changed until you import.</p>
    </div>
  );
}
