'use client';
import type { ReactNode } from 'react';
import type { FieldSpec } from '@/lib/admin/productForm';

interface Props {
  title: string;
  note?: string;
  fields: FieldSpec[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** edit mode: fields the detail does not return say "leave blank to keep" */
  editing?: boolean;
  fieldErrors?: Record<string, string>;
  listId?: Record<string, string>;
  /** fields drawn by the caller (e.g. category / HSN pickers, Sprint 31) */
  custom?: Record<string, ReactNode>;
}

/** One titled section of the product form. */
export default function ProductFieldGrid({ title, note, fields, values, onChange, editing, fieldErrors = {}, listId = {}, custom = {} }: Props) {
  return (
    <section className="card">
      <h2 className="font-semibold text-sm mb-1">{title}</h2>
      {note && <p className="text-xs text-gray-500 mb-3">{note}</p>}
      <div className="grid sm:grid-cols-2 gap-3 text-sm mt-2">
        {fields.map((f) => {
          if (custom[f.key]) {
            return (
              <div key={f.key}>
                {custom[f.key]}
                {fieldErrors[f.key] && <span className="block text-xs text-red-500 mt-1">{fieldErrors[f.key]}</span>}
              </div>
            );
          }
          // The admin record fills every field, so blanks are real changes (no 'keep' hint)
          const keepHint = '';
          const hint = [f.hint, keepHint, !f.required && !keepHint ? 'optional' : ''].filter(Boolean).join(' · ');
          const common = {
            value: values[f.key] ?? '',
            onChange: (e: { target: { value: string } }) => onChange(f.key, e.target.value),
            className: 'input',
            placeholder: keepHint ? 'Leave blank to keep' : undefined,
          };
          return (
            <label key={f.key} className={`block ${f.kind === 'textarea' ? 'sm:col-span-2' : ''}`}>
              <span className="block font-medium text-gray-700 mb-1">
                {f.label}
                {hint && <span className="font-normal text-xs text-gray-400"> ({hint})</span>}
              </span>
              {f.kind === 'textarea' ? (
                <textarea rows={3} {...common} />
              ) : (
                <input
                  {...common}
                  list={listId[f.key]}
                  inputMode={f.kind === 'rupees' ? 'decimal' : f.kind === 'int' ? 'numeric' : undefined}
                />
              )}
              {fieldErrors[f.key] && <span className="block text-xs text-red-500 mt-1">{fieldErrors[f.key]}</span>}
            </label>
          );
        })}
      </div>
    </section>
  );
}
