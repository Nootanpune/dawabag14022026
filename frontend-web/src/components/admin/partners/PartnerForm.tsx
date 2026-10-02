'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { todayIST } from '@/lib/dates';
import { formProblems, type LicenceForm, type LicenceRow, type PartnerFormValues } from '@/lib/admin/partnerOnboarding';
import AddressFields from './AddressFields';
import BusinessFields from './BusinessFields';
import LicenceRows from './LicenceRows';
import LoginRows from './LoginRows';
import PharmacistRows from './PharmacistRows';

interface Props {
  initial: PartnerFormValues;
  /** create: logins section shown; edit: logins are added separately */
  mode: 'create' | 'edit';
  prefixLocked?: boolean;
  pending: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (v: PartnerFormValues) => void;
}

/** Add / edit a partner: Business, GST, Drug licences, Pharmacists, Address (+ Logins on create). */
export default function PartnerForm({ initial, mode, prefixLocked, pending, error, submitLabel, onSubmit }: Props) {
  const [v, setV] = useState<PartnerFormValues>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const today = todayIST();
  const set = (patch: Partial<PartnerFormValues>) => setV((s) => ({ ...s, ...patch }));
  const setLicence = (form: LicenceForm, row: LicenceRow) => setV((s) => ({ ...s, licences: { ...s.licences, [form]: row } }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = formProblems(v, today, { withLogins: mode === 'create' });
    setProblems(p);
    if (!p.length) onSubmit(v);
  };

  const shown = problems.length ? problems : error ? [error] : [];
  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <BusinessFields v={v} set={set} prefixLocked={prefixLocked} />
      <LicenceRows licences={v.licences} today={today} onChange={setLicence} />
      <PharmacistRows rows={v.pharmacists} onChange={(pharmacists) => set({ pharmacists })} />
      <AddressFields v={v} set={set} />
      {mode === 'create' && <LoginRows rows={v.logins} onChange={(logins) => set({ logins })} />}
      {!!shown.length && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-medium">Please fix:</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">{shown.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary px-5 py-2.5 inline-flex items-center gap-2">
          {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
