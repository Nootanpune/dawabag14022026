'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { registrationKeys, savePartnerRegistration, saveStaffRegistration, type RegistrationInput, type RegistrationStatus } from '@/lib/pharmacistRegistrations/api';

export interface RegistrationTarget {
  kind: 'staff' | 'partner';
  id: string;
  name: string;
  registration_no: string | null;
  state_council: string | null;
  valid_till: string | null;
  status: RegistrationStatus | null;
  status_note: string | null;
  verified: boolean;
}

/**
 * Record a pharmacist's State Pharmacy Council, number, valid-till and status, and verify it
 * after checking the council's register (Sprint 39, C-03). Changing the details without
 * verifying again clears an earlier verification. A partner pharmacist's number is fixed.
 */
export default function RegistrationDialog({ target, onClose }: { target: RegistrationTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState({
    state_council: target.state_council ?? '', registration_no: target.registration_no ?? '', valid_till: target.valid_till ?? '',
    status: target.status ?? 'active', status_note: target.status_note ?? '', verified: false,
  });
  const save = useMutation({
    mutationFn: () => {
      const body: RegistrationInput = { state_council: v.state_council.trim() || null, valid_till: v.valid_till || null, status: v.status as RegistrationStatus,
        status_note: v.status_note.trim() || null, verified: v.verified };
      if (target.kind === 'staff') body.registration_no = v.registration_no.trim() || null;
      return target.kind === 'staff' ? saveStaffRegistration(target.id, body) : savePartnerRegistration(target.id, body);
    },
    onSuccess: () => { toast.success(v.verified ? 'Registration verified' : 'Registration saved'); queryClient.invalidateQueries({ queryKey: registrationKeys.all }); onClose(); },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Could not save the registration')),
  });
  const set = (k: keyof typeof v, val: string | boolean) => setV({ ...v, [k]: val });
  const canVerify = !!v.state_council.trim() && !!v.registration_no.trim() && !!v.valid_till;
  return (
    <Modal title={`Registration: ${target.name}`} onClose={onClose} size="lg">
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <label className="block"><span className="block font-medium text-gray-700 mb-1">State Pharmacy Council</span>
          <input className="input" value={v.state_council} maxLength={120} onChange={(e) => set('state_council', e.target.value)} placeholder="e.g. Maharashtra State Pharmacy Council" /></label>
        <label className="block"><span className="block font-medium text-gray-700 mb-1">Registration number</span>
          <input className="input" value={v.registration_no} maxLength={50} disabled={target.kind === 'partner'} onChange={(e) => set('registration_no', e.target.value)} />
          {target.kind === 'partner' && <span className="block text-xs text-gray-500 mt-1">Fixed: past register entries name it. Add the pharmacist again for a new number.</span>}</label>
        <label className="block"><span className="block font-medium text-gray-700 mb-1">Valid till</span>
          <input type="date" className="input" value={v.valid_till} onChange={(e) => set('valid_till', e.target.value)} /></label>
        <label className="block"><span className="block font-medium text-gray-700 mb-1">Status</span>
          <select className="input" value={v.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option><option value="lapsed">Lapsed</option><option value="suspended">Suspended</option>
          </select></label>
        <label className="block sm:col-span-2"><span className="block font-medium text-gray-700 mb-1">Note (staff only)</span>
          <input className="input" value={v.status_note} maxLength={500} onChange={(e) => set('status_note', e.target.value)} /></label>
      </div>
      <label className="flex items-start gap-2 text-sm mt-3">
        <input type="checkbox" checked={v.verified} disabled={!canVerify} onChange={(e) => set('verified', e.target.checked)} className="mt-1" />
        <span>I checked this registration on the council&apos;s register and it is valid till the date above (verified by me).</span>
      </label>
      {target.verified && !v.verified && <p className="text-xs text-amber-800 mt-1">Changing the council, number or date without ticking this clears the earlier verification.</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary text-sm">Save</button>
      </div>
    </Modal>
  );
}
