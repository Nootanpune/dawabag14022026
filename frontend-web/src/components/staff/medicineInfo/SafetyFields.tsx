'use client';
import { SAFETY_LEVELS, SAFETY_LEVEL_LABEL, SAFETY_TOPICS, SAFETY_TOPIC_LABEL, type InfoContent, type SafetyLevel } from '@/lib/medicineInfo/types';

/** Fixed topics; each gets a level and a short note. Leave the level empty to hide the topic. */
export default function SafetyFields({ value, onChange }: { value: InfoContent['safety']; onChange: (v: InfoContent['safety']) => void }) {
  return (
    <div className="space-y-2">
      {SAFETY_TOPICS.map((t) => (
        <div key={t} className="grid gap-2 sm:grid-cols-[8rem_12rem_minmax(0,1fr)] items-center">
          <label htmlFor={`safety-${t}`} className="text-sm font-medium">{SAFETY_TOPIC_LABEL[t]}</label>
          <select id={`safety-${t}`} className="input py-1.5" value={value[t].level ?? ''}
            onChange={(e) => onChange({ ...value, [t]: { ...value[t], level: (e.target.value || null) as SafetyLevel | null } })}>
            <option value="">— not shown —</option>
            {SAFETY_LEVELS.map((l) => <option key={l} value={l}>{SAFETY_LEVEL_LABEL[l]}</option>)}
          </select>
          <input aria-label={`${SAFETY_TOPIC_LABEL[t]} note`} className="input py-1.5" placeholder="Short note (optional)" maxLength={300}
            value={value[t].note} onChange={(e) => onChange({ ...value, [t]: { ...value[t], note: e.target.value } })} />
        </div>
      ))}
    </div>
  );
}
