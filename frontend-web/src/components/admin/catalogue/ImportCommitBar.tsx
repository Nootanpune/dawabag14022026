'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ImportSummary } from '@/lib/admin/catalogueImport';

interface Props {
  summary: ImportSummary;
  pending: boolean;
  onCommit: (skipErrors: boolean) => void;
}

/** Commit the previewed file; rows with errors block the import unless skipped. */
export default function ImportCommitBar({ summary, pending, onCommit }: Props) {
  const errors = summary.products.error + summary.batches.error;
  const changes = summary.products.create + summary.products.update + summary.batches.create;
  const [skip, setSkip] = useState(false);
  const blocked = (errors > 0 && !skip) || changes === 0;
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 text-sm">
      <div>
        {errors > 0 ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
            Skip the {errors} row(s) with errors and import the valid rows only
          </label>
        ) : (
          <p className="text-gray-600">No errors. The whole file is applied in one go, or nothing is.</p>
        )}
        {changes === 0 && <p className="text-xs text-gray-500 mt-1">Nothing to import.</p>}
      </div>
      <button onClick={() => onCommit(skip)} disabled={blocked || pending} className="btn-primary inline-flex items-center gap-2">
        {pending && <Loader2 className="w-4 h-4 animate-spin" />} Import {changes} change(s)
      </button>
    </div>
  );
}
