'use client';
import { useState } from 'react';
import { joinList, splitList, type FamilyMember, type MemberInput } from '@/lib/healthProfile/api';

/** Name, relation, age and their own allergies / conditions. */
export default function FamilyMemberForm({ initial, pending, error, onSubmit, onCancel }: {
  initial?: FamilyMember; pending: boolean; error: string; onSubmit: (v: MemberInput) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.full_name ?? '');
  const [relation, setRelation] = useState(initial?.relationship ?? '');
  const [age, setAge] = useState(initial?.age != null ? String(initial.age) : '');
  const [allergies, setAllergies] = useState(joinList(initial?.allergies ?? []));
  const [conditions, setConditions] = useState(joinList(initial?.conditions ?? []));
  const p = initial?.id ?? 'new';
  return (
    <form className="rounded-lg border border-gray-200 p-3 space-y-2" aria-label="Family member"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ full_name: name.trim(), relationship: relation.trim(), age_years: age === '' ? null : Number(age),
          allergies: splitList(allergies), conditions: splitList(conditions) });
      }}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_6rem]">
        <div>
          <label htmlFor={`fm-name-${p}`} className="block text-xs font-semibold mb-1">Name</label>
          <input id={`fm-name-${p}`} className="input" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`fm-rel-${p}`} className="block text-xs font-semibold mb-1">Relation</label>
          <input id={`fm-rel-${p}`} className="input" required minLength={2} maxLength={40} placeholder="e.g. mother" value={relation} onChange={(e) => setRelation(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`fm-age-${p}`} className="block text-xs font-semibold mb-1">Age</label>
          <input id={`fm-age-${p}`} className="input" inputMode="numeric" min={0} max={120} type="number" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`fm-all-${p}`} className="block text-xs font-semibold mb-1">Allergies (one per line)</label>
          <textarea id={`fm-all-${p}`} rows={2} className="input" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`fm-cond-${p}`} className="block text-xs font-semibold mb-1">Health conditions (one per line)</label>
          <textarea id={`fm-cond-${p}`} rows={2} className="input" value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-outline text-xs">Cancel</button>
        <button type="submit" disabled={pending} className="btn-primary text-xs">Save family member</button>
      </div>
    </form>
  );
}
