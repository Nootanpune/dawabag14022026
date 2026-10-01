'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { decideAdjustment } from '@/lib/stock/api';
import type { Adjustment } from '@/lib/stock/types';
import { REASON_LABELS } from '@/lib/stock/labels';
import { formatPaise } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

interface Props {
  adjustment: Adjustment;
  approve: boolean;
  onClose: () => void;
}

/** Approve or reject a stock adjustment. The server refuses (403) if you raised it yourself (two-person rule, C-46). */
export default function DecideDialog({ adjustment: a, approve, onClose }: Props) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const decide = useMutation({
    mutationFn: () => decideAdjustment(a.id, approve, notes.trim()),
    onSuccess: () => {
      toast.success(`${a.adjustment_no} ${approve ? 'approved' : 'rejected'}`);
      onClose();
    },
    onError: (err: any) =>
      setError(
        err?.response?.status === 403
          ? 'You raised this adjustment, so another admin must decide it (two-person rule).'
          : getApiErrorMessage(err, 'Could not record the decision')
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['stock'] }),
  });

  const submit = () => {
    if (notes.trim().length < 3) return setError('Add a note (at least 3 characters)');
    setError('');
    decide.mutate();
  };

  return (
    <Modal title={`${approve ? 'Approve' : 'Reject'} ${a.adjustment_no}`} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        {REASON_LABELS[a.reason]}: <span className="font-medium">{a.quantity_delta > 0 ? `+${a.quantity_delta}` : a.quantity_delta}</span> ×{' '}
        {a.product_name} (batch {a.batch_number}), {formatPaise(a.value_paise)} at cost. Requested by {a.requested_by_name}.
      </p>
      <label className="block text-sm font-medium text-gray-700 mb-1">{approve ? 'Approval note' : 'Reason for rejecting'}</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} className="input" autoFocus />
      <DialogActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={approve ? 'Approve' : 'Reject'}
        danger={!approve}
        pending={decide.isPending}
        error={error}
      />
    </Modal>
  );
}
