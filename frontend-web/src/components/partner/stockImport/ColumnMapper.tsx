'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { duplicateColumn, missingFields, saveMapping, type ImportSummary, type Mapping, type StockImport } from '@/lib/partner/stockImport';

const SOURCE_NOTE: Record<StockImport['mapping_source'], string> = {
  preset: 'We recognised this report and chose the columns for you. Check them and continue.',
  saved: 'Same headings as your last upload: we used the columns you chose then.',
  suggested: 'We guessed the columns from the headings. Please check each one.',
  confirmed: 'These are the columns you confirmed.',
};

/** One dropdown per Dawabag detail, showing sample values from the file. Saved on the server and remembered. */
export default function ColumnMapper({ imp, onSaved, onCancel }: { imp: StockImport; onSaved: (s: ImportSummary) => void; onCancel?: () => void }) {
  const [mapping, setMapping] = useState<Mapping>(imp.mapping);
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => saveMapping(imp.id, mapping),
    onSuccess: onSaved,
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save the columns')),
  });

  const submit = () => {
    const missing = missingFields(imp.fields, mapping);
    if (missing.length) return setError(`Choose the column for: ${missing.map((f) => f.label).join(', ')}`);
    const dup = duplicateColumn(mapping, imp.headers);
    if (dup) return setError(`"${dup}" is chosen for two details; choose it once`);
    setError('');
    save.mutate();
  };

  const sample = (col: number) => imp.column_samples[col]?.slice(0, 2).join(', ');

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Which column holds what?</h2>
        <p className="text-sm text-gray-500 mt-1">
          {imp.source_software ? `${imp.source_software}. ` : ''}
          {SOURCE_NOTE[imp.mapping_source]} Headings found on row {imp.header_row}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {imp.fields.map((f) => {
          const value = mapping[f.key];
          return (
            <label key={f.key} className="block">
              <span className="block text-xs font-medium text-gray-700 mb-1">
                {f.label} {f.required ? <span className="text-red-500">*</span> : <span className="text-gray-400">(optional)</span>}
              </span>
              <select
                className="input"
                aria-label={f.label}
                value={value === null || value === undefined ? '' : String(value)}
                onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">— Not in my file —</option>
                {imp.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}{sample(i) ? ` (e.g. ${sample(i)})` : ''}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-gray-400 mt-0.5">{f.hint}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <button onClick={onCancel} className="btn-outline text-sm">Back</button>}
        <button onClick={submit} disabled={save.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Continue: check the lines
        </button>
      </div>
    </div>
  );
}
