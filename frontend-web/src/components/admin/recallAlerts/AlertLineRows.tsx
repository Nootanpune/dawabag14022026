'use client';
import { Plus, Trash2 } from 'lucide-react';
import type { AlertLineDraft } from '@/lib/recallAlerts/types';
import { blankAlertLine } from '@/lib/recallAlerts/labels';

interface Props {
  rows: AlertLineDraft[];
  onChange: (rows: AlertLineDraft[]) => void;
}

/** Editable alert lines: drug name, batch, manufacturer, reason (C-28). */
export default function AlertLineRows({ rows, onChange }: Props) {
  const patch = (key: string, p: Partial<AlertLineDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-12 gap-2 items-start border border-gray-100 rounded-lg p-2">
          <span className="col-span-12 sm:col-span-1 text-xs text-gray-400 pt-2">#{i + 1}</span>
          <input
            value={r.drug_name}
            onChange={(e) => patch(r.key, { drug_name: e.target.value })}
            maxLength={300}
            placeholder="Drug name"
            aria-label={`Line ${i + 1} drug name`}
            className="input col-span-12 sm:col-span-4"
          />
          <input
            value={r.batch_number}
            onChange={(e) => patch(r.key, { batch_number: e.target.value })}
            maxLength={100}
            placeholder="Batch No."
            aria-label={`Line ${i + 1} batch number`}
            className="input font-mono col-span-6 sm:col-span-3"
          />
          <input
            value={r.manufacturer}
            onChange={(e) => patch(r.key, { manufacturer: e.target.value })}
            maxLength={300}
            placeholder="Manufacturer"
            aria-label={`Line ${i + 1} manufacturer`}
            className="input col-span-6 sm:col-span-3"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
            disabled={rows.length === 1}
            className="col-span-12 sm:col-span-1 p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 justify-self-end"
            aria-label={`Remove line ${i + 1}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <input
            value={r.reason}
            onChange={(e) => patch(r.key, { reason: e.target.value })}
            maxLength={2000}
            placeholder="Reason (e.g. not of standard quality: dissolution)"
            aria-label={`Line ${i + 1} reason`}
            className="input col-span-12 sm:col-start-2 sm:col-span-10"
          />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, blankAlertLine()])} className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" /> Add line
      </button>
    </div>
  );
}
