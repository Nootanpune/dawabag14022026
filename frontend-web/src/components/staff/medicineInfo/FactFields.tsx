'use client';
import type { InfoContent } from '@/lib/medicineInfo/types';

/** Fact box: classes and habit forming (Yes / No / not stated). */
export default function FactFields({ value, onChange }: { value: InfoContent['facts']; onChange: (v: InfoContent['facts']) => void }) {
  const text = (k: 'therapeutic_class' | 'chemical_class' | 'action_class', label: string) => (
    <div>
      <label htmlFor={`fact-${k}`} className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input id={`fact-${k}`} className="input" maxLength={120} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {text('therapeutic_class', 'Therapeutic class')}
      {text('chemical_class', 'Chemical class')}
      {text('action_class', 'Action class')}
      <div>
        <label htmlFor="fact-habit" className="block text-xs font-semibold text-gray-700 mb-1">Habit forming</label>
        <select id="fact-habit" className="input" value={value.habit_forming == null ? '' : value.habit_forming ? 'yes' : 'no'}
          onChange={(e) => onChange({ ...value, habit_forming: e.target.value === '' ? null : e.target.value === 'yes' })}>
          <option value="">— not stated —</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>
    </div>
  );
}
