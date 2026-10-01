'use client';
import { useState } from 'react';
import FrequencySelect, { frequencyError } from './FrequencySelect';

export default function RefillFrequencyEditor({
  current,
  pending,
  onSave,
  onCancel,
}: {
  current: number;
  pending?: boolean;
  onSave: (days: number) => void;
  onCancel: () => void;
}) {
  const [days, setDays] = useState(String(current));
  const [error, setError] = useState('');
  const save = () => {
    const e = frequencyError(days);
    if (e) return setError(e);
    onSave(Number(days));
  };
  return (
    <div className="space-y-2">
      <FrequencySelect value={days} onChange={setDays} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-gray-500 px-3 py-1.5">
          Cancel
        </button>
        <button onClick={save} disabled={pending} className="btn-primary text-xs py-1.5 px-3">
          Save frequency
        </button>
      </div>
    </div>
  );
}
