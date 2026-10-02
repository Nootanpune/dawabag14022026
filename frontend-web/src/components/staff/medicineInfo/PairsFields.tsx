'use client';
import { Plus, Trash2 } from 'lucide-react';

interface Props<K extends string> {
  rows: Record<K, string>[];
  keys: readonly [K, K];
  labels: readonly [string, string];
  placeholders?: readonly [string, string];
  addLabel: string;
  multiline?: boolean;
  onChange: (rows: Record<K, string>[]) => void;
}

/** Repeatable two-field rows: FAQs (question / answer) and references (source / date). */
export default function PairsFields<K extends string>({ rows, keys, labels, placeholders, addLabel, multiline, onChange }: Props<K>) {
  const set = (i: number, k: K, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const empty = () => Object.fromEntries(keys.map((k) => [k, ''])) as Record<K, string>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start">
          <input aria-label={`${labels[0]} ${i + 1}`} className="input" placeholder={placeholders?.[0] ?? labels[0]} value={r[keys[0]]}
            onChange={(e) => set(i, keys[0], e.target.value)} />
          {multiline ? (
            <textarea aria-label={`${labels[1]} ${i + 1}`} className="input" rows={2} placeholder={placeholders?.[1] ?? labels[1]} value={r[keys[1]]}
              onChange={(e) => set(i, keys[1], e.target.value)} />
          ) : (
            <input aria-label={`${labels[1]} ${i + 1}`} className="input" placeholder={placeholders?.[1] ?? labels[1]} value={r[keys[1]]}
              onChange={(e) => set(i, keys[1], e.target.value)} />
          )}
          <button type="button" aria-label={`Remove ${labels[0].toLowerCase()} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="p-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, empty()])} className="text-xs font-medium text-brand-700 inline-flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  );
}
