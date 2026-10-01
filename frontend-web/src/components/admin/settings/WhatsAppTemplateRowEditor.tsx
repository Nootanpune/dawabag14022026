'use client';
import { Plus, Trash2, X } from 'lucide-react';
import { labelOf } from '@/lib/admin/dltTemplates';
import { WA_MAX_VARS, WA_MESSAGE_TYPES, WA_VARIABLES, type WaRow } from '@/lib/admin/whatsappTemplates';

interface Props {
  row: WaRow;
  /** message types already used by other rows */
  taken: Set<string>;
  onChange: (row: WaRow) => void;
  onRemove: () => void;
}

/** One message type → its Meta-approved template, language and body variables {{1}}, {{2}}… in order. */
export default function WhatsAppTemplateRowEditor({ row, taken, onChange, onRemove }: Props) {
  const known = (WA_MESSAGE_TYPES as readonly string[]).includes(row.type);
  const types: readonly string[] = known || !row.type ? WA_MESSAGE_TYPES : [row.type, ...WA_MESSAGE_TYPES];
  const setVar = (i: number, v: string) => onChange({ ...row, vars: row.vars.map((x, j) => (j === i ? v : x)) });

  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="py-2 pr-2">
        <select value={row.type} onChange={(e) => onChange({ ...row, type: e.target.value })} className="input" aria-label="Message type">
          <option value="">Choose…</option>
          {types.map((t) => (
            <option key={t} value={t} disabled={taken.has(t)}>
              {labelOf(t)}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-2">
        <input
          value={row.name}
          onChange={(e) => onChange({ ...row, name: e.target.value })}
          maxLength={512}
          placeholder="order_dispatched"
          className="input font-mono"
          aria-label="Template name"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          value={row.language}
          onChange={(e) => onChange({ ...row, language: e.target.value })}
          maxLength={5}
          placeholder="en"
          className="input font-mono w-20"
          aria-label="Language code"
        />
      </td>
      <td className="py-2 pr-2">
        <div className="space-y-1.5">
          {row.vars.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 font-mono w-10">{`{{${i + 1}}}`}</span>
              <select value={v} onChange={(e) => setVar(i, e.target.value)} className="input w-40" aria-label={`Variable ${i + 1}`}>
                <option value="">Our value…</option>
                {WA_VARIABLES.map((o) => (
                  <option key={o} value={o}>
                    {labelOf(o)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange({ ...row, vars: row.vars.filter((_, j) => j !== i) })}
                className="p-1 text-gray-400 hover:text-red-600"
                aria-label="Remove variable"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {row.vars.length < WA_MAX_VARS && (
            <button
              type="button"
              onClick={() => onChange({ ...row, vars: [...row.vars, ''] })}
              className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add variable
            </button>
          )}
        </div>
      </td>
      <td className="py-2 text-right">
        <button type="button" onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove message type">
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
