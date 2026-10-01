'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import { adminDoctorKeys, verifyDoctor } from '@/lib/telemedicine/adminApi';
import type { AdminDoctor } from '@/lib/telemedicine/types';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Records the admin's check of the registration against the NMC / state council register (C-22). */
export default function VerifyDoctorDialog({ d, approve, onClose }: { d: AdminDoctor; approve: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  // The number the admin searched the register for; the server refuses if the profile changed since (409)
  const [regNo, setRegNo] = useState(d.nmc_reg_number ?? '');
  const [error, setError] = useState('');
  const decide = useMutation({
    mutationFn: () => verifyDoctor(d.id, approve, notes.trim(), regNo.trim()),
    onSuccess: (r) => {
      toast.success(approve ? `Dr ${d.full_name} verified` : `Dr ${d.full_name} rejected`);
      const n = r?.consultations_cancelled_refunds ?? 0;
      if (!approve && n > 0) toast.info(`${n} consultation${n === 1 ? '' : 's'} cancelled and refunded`);
      onClose();
    },
    onError: (err: any) => {
      const message = getApiErrorMessage(err, 'Could not save the decision');
      if (err?.response?.status === 409) {
        // Registration edited meanwhile: close so the admin reviews the refreshed row
        toast.error(message);
        onClose();
        return;
      }
      setError(message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminDoctorKeys.all }),
  });
  const confirm = () => {
    const n = notes.trim().length;
    if (n < 3 || n > 1000) return setError('Notes: 3 to 1000 characters');
    if (approve && regNo.trim().length < 3) return setError('Enter the registration number you checked');
    decide.mutate();
  };
  return (
    <Modal title={approve ? 'Verify registration' : 'Reject registration'} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <p className="font-medium">Dr {d.full_name}</p>
        <p className="text-gray-600">{d.qualification}</p>
        <p className="text-gray-600">
          {d.council} · Reg. no. <span className="font-medium">{d.nmc_reg_number}</span> ({d.registration_year})
        </p>
      </div>
      {approve && (
        <label className="block text-sm mb-3">
          <span className="block font-medium text-gray-700 mb-1">Registration number you checked</span>
          <input value={regNo} onChange={(e) => setRegNo(e.target.value)} maxLength={60} className="input font-mono" />
        </label>
      )}
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {approve ? 'How it was checked (register searched, date)' : 'Reason (shown to the doctor)'}
      </label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} autoFocus className="input" />
      <DialogActions
        onCancel={onClose}
        onConfirm={confirm}
        confirmLabel={approve ? 'Verify' : 'Reject'}
        danger={!approve}
        pending={decide.isPending}
        error={error}
      />
    </Modal>
  );
}
