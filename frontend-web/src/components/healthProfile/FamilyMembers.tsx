'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  addFamilyMember, healthKeys, removeFamilyMember, updateFamilyMember, type HealthProfile, type MemberInput,
} from '@/lib/healthProfile/api';
import FamilyMemberForm from './FamilyMemberForm';

/** Family members (name, relation, age, their allergies / conditions) — under the same consent. */
export default function FamilyMembers({ profile }: { profile: HealthProfile }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [error, setError] = useState('');
  const done = (p: HealthProfile) => { queryClient.setQueryData(healthKeys.mine, p); setEditing(null); setError(''); };
  const save = useMutation({
    mutationFn: (v: MemberInput) => (editing && editing !== 'new' ? updateFamilyMember(editing, v) : addFamilyMember(v)),
    onSuccess: (p) => { done(p); toast.success('Family member saved'); },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save')),
  });
  const remove = useMutation({ mutationFn: removeFamilyMember, onSuccess: done, onError: (e) => toast.error(getApiErrorMessage(e, 'Could not remove')) });

  return (
    <section className="card space-y-3 text-sm" aria-labelledby="family-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="family-heading" className="font-semibold">Family members</h2>
        {profile.consent.given && editing === null && (
          <button type="button" onClick={() => setEditing('new')} className="btn-outline text-xs py-1 px-3 inline-flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>
      {!profile.consent.given && <p className="text-xs text-gray-500">Save your health profile with the consent tick first.</p>}
      {editing === 'new' && <FamilyMemberForm pending={save.isPending} error={error} onSubmit={(v) => save.mutate(v)} onCancel={() => setEditing(null)} />}
      <ul className="divide-y divide-gray-100">
        {profile.family_members.map((m) => (
          <li key={m.id} className="py-2" data-testid="family-member">
            {editing === m.id ? (
              <FamilyMemberForm initial={m} pending={save.isPending} error={error} onSubmit={(v) => save.mutate(v)} onCancel={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{m.full_name} <span className="font-normal text-gray-500">· {m.relationship ?? 'family'}{m.age != null ? ` · ${m.age} years` : ''}</span></p>
                  {m.allergies.length > 0 && <p className="text-xs text-gray-600">Allergies: {m.allergies.join(', ')}</p>}
                  {m.conditions.length > 0 && <p className="text-xs text-gray-600">Conditions: {m.conditions.join(', ')}</p>}
                </div>
                <button type="button" aria-label={`Edit ${m.full_name}`} onClick={() => setEditing(m.id)} className="p-1 text-brand-700"><Pencil className="w-4 h-4" /></button>
                <button type="button" aria-label={`Remove ${m.full_name}`} onClick={() => remove.mutate(m.id)} className="p-1 text-red-700"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
