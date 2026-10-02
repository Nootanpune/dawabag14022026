'use client';
import { useState, type DragEvent } from 'react';
import { FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stockFileError } from '@/lib/partner/stockImport';

interface Props {
  pending: boolean;
  onUpload: (file: File) => void;
}

/** Drag & drop or choose the stock export. The File stays in memory until it is sent. */
export default function StockFileDrop({ pending, onUpload }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');

  const choose = (f: File | null) => {
    setFile(f);
    setError(f ? stockFileError(f) : '');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files?.[0] ?? null);
  };
  const send = () => {
    const e = stockFileError(file);
    if (e) return setError(e);
    onUpload(file!);
  };

  return (
    <div className="card space-y-4 text-sm">
      <div className="space-y-1 text-gray-700">
        <p className="font-medium text-gray-900">Export a batch-wise stock statement from your billing software (e.g. Allied MediVision) as Excel or CSV, then upload it here.</p>
        <p className="text-gray-500">
          In MediVision Platinum, open the <em>Stock Report Of Batch-wise Products</em> and export it to Excel. From other software, any
          report with item name, batch, expiry, MRP and quantity works — you choose the columns once and we remember them.
        </p>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-colors',
          over ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400 bg-gray-50'
        )}
        data-testid="stock-file-drop"
      >
        <UploadCloud className="w-8 h-8 text-brand-600" />
        <span className="font-medium text-gray-800">Drop the file here, or tap to choose it</span>
        <span className="text-xs text-gray-500">Excel (.xlsx, .xls) or CSV, up to 5 MB</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="sr-only"
          aria-label="Choose stock file"
          onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ''; }}
        />
      </label>
      {file && (
        <p className="flex items-center gap-2 text-gray-700 break-all">
          <FileSpreadsheet className="w-4 h-4 shrink-0 text-gray-400" /> {file.name}
          <span className="text-xs text-gray-400 shrink-0">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-400">Nothing changes in your stock until you check the lines and press Apply.</p>
        <button onClick={send} disabled={!file || pending} className="btn-primary text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />} Upload and check
        </button>
      </div>
    </div>
  );
}
