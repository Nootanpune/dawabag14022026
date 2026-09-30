'use client';
import { MAX_FREQUENCY_DAYS, MIN_FREQUENCY_DAYS } from '@/lib/refills';

const PRESETS = [7, 15, 30, 45, 60, 90];

/** Frequency in days (7–180): common presets or a custom number. */
export default function FrequencySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const custom = value !== '' && !PRESETS.includes(Number(value));
  return (
    <div className="flex gap-2">
      <select
        value={custom ? 'custom' : value}
        onChange={(e) => onChange(e.target.value === 'custom' ? '' : e.target.value)}
        className="input"
      >
        <option value="">Choose…</option>
        {PRESETS.map((d) => (
          <option key={d} value={d}>
            Every {d} days
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {(custom || value === '') && (
        <input
          type="number"
          min={MIN_FREQUENCY_DAYS}
          max={MAX_FREQUENCY_DAYS}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="days"
          className="input w-24"
          aria-label="Days between refills"
        />
      )}
    </div>
  );
}

export function frequencyError(value: string): string {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_FREQUENCY_DAYS || n > MAX_FREQUENCY_DAYS) {
    return `Choose between ${MIN_FREQUENCY_DAYS} and ${MAX_FREQUENCY_DAYS} days`;
  }
  return '';
}
