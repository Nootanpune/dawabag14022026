'use client';
import { useEffect, useState, type ReactNode } from 'react';

// Inputs that save to the server as you go: a text box saves when you leave it
// (or press Enter), a choice saves when it changes. The value shown always comes
// back from the server; nothing is kept in the browser.

interface Base {
  id: string;
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function DraftText({ id, label, hint, value, onSave, multiline, list, placeholder, maxLength = 500, disabled, className }: Base & {
  value: string | null;
  onSave: (v: string | null) => void;
  multiline?: boolean;
  list?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const commit = () => {
    const next = text.trim();
    if (next !== (value ?? '')) onSave(next || null);
  };
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
      {multiline ? (
        <textarea id={id} value={text} rows={2} maxLength={maxLength} placeholder={placeholder} disabled={disabled}
          onChange={(e) => setText(e.target.value)} onBlur={commit} className="input text-sm py-1.5" />
      ) : (
        <input id={id} value={text} maxLength={maxLength} placeholder={placeholder} list={list} disabled={disabled}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          className="input text-sm py-1.5" />
      )}
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function DraftSelect({ id, label, hint, value, options, onSave, disabled, className }: Base & {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onSave(e.target.value)} className="input text-sm py-1.5">
        <option value="">— choose —</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}
