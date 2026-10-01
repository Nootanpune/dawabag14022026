'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { handleDataRequest, type DataRequest } from '@/lib/privacy/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

interface Props {
  request: DataRequest;
  action: 'complete' | 'reject';
  onClose: () => void;
}

/**
 * Completing an erasure anonymises the account on the server while keeping
 * records the law requires (C-44); the outcome is recorded and audited.
 */
export default function HandleRequestDialog({ request: r, action, onClose }: Props) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => handleDataRequest(r.id, action, outcome.trim()),
    onSuccess: () => {
      toast.success(`Request ${action === 'complete' ? 'completed' : 'rejected'}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update the request')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['privacy', 'requests'] }),
  });

  const submit = () => {
    if (outcome.trim().length < 3) return setError('Record the outcome (at least 3 characters)');
    setError('');
    save.mutate();
  };

  const erasure = r.request_type === 'erasure' && action === 'complete';
  return (
    <Modal title={`${action === 'complete' ? 'Complete' : 'Reject'} ${r.request_type} request`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        {r.user_name ?? 'User'} · {r.mobile ?? '—'}
      </p>
      {erasure && (
        <p className="text-xs text-red-800 bg-red-50 rounded-lg p-2 mb-3">
          The account will be anonymised and signed out. Tax invoices, prescriptions and the H1 register are kept as the law requires.
        </p>
      )}
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Outcome (recorded in the audit trail)</span>
        <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} maxLength={2000} className="input" autoFocus />
      </label>
      <DialogActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={action === 'complete' ? 'Complete' : 'Reject'}
        danger={erasure || action === 'reject'}
        pending={save.isPending}
        error={error}
      />
    </Modal>
  );
}
