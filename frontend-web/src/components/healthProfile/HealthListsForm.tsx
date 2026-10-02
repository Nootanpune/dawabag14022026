'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { healthKeys, joinList, saveHealthProfile, splitList, type HealthProfile } from '@/lib/healthProfile/api';
import ConsentBox from './ConsentBox';

function ListBox({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1">{label}</label>
      <textarea id={id} rows={3} className="input" placeholder={hint} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Your allergies, conditions and current medicines; the first save needs the consent tick. */
export default function HealthListsForm({ profile }: { profile: HealthProfile }) {
  const queryClient = useQueryClient();
  const [allergies, setAllergies] = useState(joinList(profile.allergies));
  const [conditions, setConditions] = useState(joinList(profile.conditions));
  const [medicines, setMedicines] = useState(joinList(profile.current_medicines));
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => saveHealthProfile({
      ...(profile.consent.given ? {} : { consent }), allergies: splitList(allergies), conditions: splitList(conditions), current_medicines: splitList(medicines),
    }),
    onSuccess: (p) => { queryClient.setQueryData(healthKeys.mine, p); setError(''); toast.success('Health profile saved'); },
    onError: (e) => setError(getApiErrorMessage(e, 'Could not save')),
  });
  return (
    <form className="card space-y-3 text-sm" aria-label="Your health details" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h2 className="font-semibold">You</h2>
      <ListBox id="hp-allergies" label="Allergies (one per line)" hint="e.g. Penicillin" value={allergies} onChange={setAllergies} />
      <ListBox id="hp-conditions" label="Health conditions (one per line)" hint="e.g. Asthma" value={conditions} onChange={setConditions} />
      <ListBox id="hp-medicines" label="Medicines you take now (one per line)" hint="e.g. Salbutamol inhaler" value={medicines} onChange={setMedicines} />
      {!profile.consent.given && <ConsentBox purpose={profile.consent.purpose} checked={consent} onChange={setConsent} />}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={save.isPending || (!profile.consent.given && !consent)} className="btn-primary text-sm inline-flex items-center gap-1.5">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save
        </button>
      </div>
    </form>
  );
}
