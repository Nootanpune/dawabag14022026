'use client';
import { Plus, Trash2, X } from 'lucide-react';
import { DLT_MESSAGE_TYPES, DLT_VARIABLES, labelOf, type DltRow } from '@/lib/admin/dltTemplates';

interface Props {
  row: DltRow;
  /** message types already used by other rows */
  taken: Set<string>;
  onChange: (row: DltRow) => void;
  onRemove: () => void;
}

/** One message type → DLT template id and its MSG91 variable mappings. */
export default function DltTemplateRowEditor({ row, taken, onChange, onRemove }: Props) {
  const types = DLT_MESSAGE_TYPES.includes(row.type as (typeof DLT_MESSAGE_TYPES)[number]) || !row.type ? DLT_MESSAGE_TYPES : [row.type, ...DLT_MESSAGE_TYPES];
  const setVar = (i: number, patch: Partial<DltRow['vars'][number]>) =>
    onChange({ ...row, vars: row.vars.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

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
          value={row.template_id}
          onChange={(e) => onChange({ ...row, template_id: e.target.value })}
          maxLength={60}
          placeholder="MSG91 template / flow id"
          className="input font-mono"
          aria-label="DLT template id"
        />
      </td>
      <td className="py-2 pr-2">
        <div className="space-y-1.5">
          {row.vars.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={v.name}
                onChange={(e) => setVar(i, { name: e.target.value })}
                maxLength={30}
                placeholder="MSG91 var, e.g. var1"
                className="input font-mono w-36"
                aria-label="MSG91 variable name"
              />
              <span className="text-gray-400">=</span>
              <select value={v.ours} onChange={(e) => setVar(i, { ours: e.target.value })} className="input w-40" aria-label="Our value">
                <option value="">Our value…</option>
                {DLT_VARIABLES.map((o) => (
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
          <button
            type="button"
            onClick={() => onChange({ ...row, vars: [...row.vars, { name: '', ours: '' }] })}
            className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add variable
          </button>
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
