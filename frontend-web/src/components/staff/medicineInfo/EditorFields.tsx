'use client';
import type { ReactNode } from 'react';

/** A labelled multi-line text box. `list`: one point per line. */
export function TextField({ id, label, value, onChange, rows = 3, list, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; rows?: number; list?: boolean; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-700 mb-1">
        {label}{list && <span className="font-normal text-gray-500"> — one point per line</span>}
      </label>
      <textarea id={id} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className="input" />
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

/** A titled group of fields on the editor. */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card space-y-3">
      <legend className="text-sm font-semibold text-gray-900 px-1">{title}</legend>
      {children}
    </fieldset>
  );
}
