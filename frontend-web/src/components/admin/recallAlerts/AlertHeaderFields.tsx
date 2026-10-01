'use client';
import type { AlertHeaderDraft, AlertSource } from '@/lib/recallAlerts/types';
import { SOURCE_OPTIONS } from '@/lib/recallAlerts/labels';
import { nowISTInput } from '@/lib/dates';

interface Props {
  value: AlertHeaderDraft;
  onChange: (patch: Partial<AlertHeaderDraft>) => void;
}

/** Who issued the alert, its reference and when we received it (the 4-hour clock starts there, C-28). */
export default function AlertHeaderFields({ value, onChange }: Props) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 text-sm">
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Source</span>
        <select value={value.source} onChange={(e) => onChange({ source: e.target.value as AlertSource })} className="input">
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Received at (IST)</span>
        <input
          type="datetime-local"
          value={value.received_local}
          max={nowISTInput()}
          onChange={(e) => onChange({ received_local: e.target.value })}
          className="input"
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="block font-medium text-gray-700 mb-1">Reference</span>
        <input
          value={value.reference}
          onChange={(e) => onChange({ reference: e.target.value })}
          maxLength={200}
          placeholder="e.g. CDSCO NSQ alert for September 2026, FDA letter no."
          className="input"
        />
      </label>
      <p className="sm:col-span-2 text-xs text-gray-500">
        Every batch we hold or sold must be recalled or cleared within 4 hours of receipt.
      </p>
    </div>
  );
}
