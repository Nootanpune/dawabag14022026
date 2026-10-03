'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import { decideRegistration, type PractitionerRow } from '@/lib/practitioner/admin';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { todayIST } from '@/lib/dates';

/** Verify (with valid till), refuse or suspend a doctor's / institution's registration (Sprint 44). */
export default function RegistrationDecisionDialog({ row, onClose }: { row: PractitionerRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState(row.registration_number ?? '');
  const [council, setCouncil] = useState(row.council ?? '');
  const [validTill, setValidTill] = useState(row.valid_till ?? '');
  const [name, setName] = useState(row.name_as_per_register ?? '');
  const [kind, setKind] = useState<'doctor' | 'institution'>(row.kind);
  const [reason, setReason] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'verify' | 'reject' | 'suspend') => decideRegistration(row.user_id, {
      decision, registration_number: number, council, valid_till: validTill || null, name_as_per_register: name || null, kind, reason: reason || null,
    }),
    onSuccess: (r) => { toast.success(r.status === 'verified' ? 'Registration verified' : `Registration ${r.status}`); onClose(); },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not save the decision')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'practitioners'] }),
  });
  return (
    <Modal title="Medical council registration" onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p className="text-xs text-gray-600">Check the council&apos;s register and the uploaded certificate before verifying.</p>
        <label className="block"><span className="text-xs text-gray-500">Registration number{kind === 'institution' ? ' (responsible doctor)' : ''}</span>
          <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label className="block"><span className="text-xs text-gray-500">Council</span>
          <input className="input" value={council} onChange={(e) => setCouncil(e.target.value)} /></label>
        <label className="block"><span className="text-xs text-gray-500">Name as on the register</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="text-xs text-gray-500">Valid till (needed to verify)</span>
          <input className="input" type="date" min={todayIST()} value={validTill} onChange={(e) => setValidTill(e.target.value)} /></label>
        <label className="block"><span className="text-xs text-gray-500">Buyer is a</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'doctor' | 'institution')}>
            <option value="doctor">Doctor</option><option value="institution">Medical institution</option>
          </select></label>
        <label className="block"><span className="text-xs text-gray-500">Reason (to refuse or suspend)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button type="button" className="btn-outline text-sm" disabled={decide.isPending || reason.trim().length < 5} onClick={() => decide.mutate('suspend')}>Suspend</button>
        <button type="button" className="btn-outline text-sm" disabled={decide.isPending || reason.trim().length < 5} onClick={() => decide.mutate('reject')}>Not verified</button>
        <button type="button" className="btn-primary text-sm" disabled={decide.isPending || !validTill || !number || !council} onClick={() => decide.mutate('verify')}>
          {decide.isPending && <Loader2 className="w-4 h-4 animate-spin inline mr-1" aria-hidden="true" />} Verify
        </button>
      </div>
    </Modal>
  );
}
