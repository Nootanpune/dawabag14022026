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
  const [error, setError] = useState('');
  const decide = useMutation({
    mutationFn: () => verifyDoctor(d.id, approve, notes.trim()),
    onSuccess: () => {
      toast.success(approve ? `Dr ${d.full_name} verified` : `Dr ${d.full_name} rejected`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save the decision')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminDoctorKeys.all }),
  });
  const confirm = () => {
    const n = notes.trim().length;
    if (n < 3 || n > 1000) return setError('Notes: 3 to 1000 characters');
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
