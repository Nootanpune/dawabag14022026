'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { decidePurchaseReturn, purchaseReturnKeys } from '@/lib/purchaseReturns/api';
import type { PurchaseReturn } from '@/lib/purchaseReturns/types';
import { formatPaise } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/** Approve (stock leaves the batches now) or reject. 403 if you raised it yourself (two-person rule, C-46). */
export default function DecideReturnDialog({ r, approve, onClose }: { r: PurchaseReturn; approve: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const decide = useMutation({
    mutationFn: () => decidePurchaseReturn(r.id, approve, notes.trim()),
    onSuccess: () => {
      toast.success(`${r.return_no} ${approve ? 'approved — stock taken out of the batches' : 'rejected'}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record the decision')),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: purchaseReturnKeys.all });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });

  const submit = () => {
    const n = notes.trim().length;
    if (n < 3 || n > 500) return setError('Add a note (3–500 characters)');
    setError('');
    decide.mutate();
  };

  return (
    <Modal title={`${approve ? 'Approve' : 'Reject'} ${r.return_no}`} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        {r.lines.length} batch line(s) to {r.supplier_name}, {formatPaise(r.total_paise)} incl. GST. Raised by {r.requested_by_name}.
        {approve && ' Approving takes these units out of stock now.'}
      </p>
      <label className="block text-sm font-medium text-gray-700 mb-1">{approve ? 'Approval note' : 'Reason for rejecting'}</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} className="input" autoFocus />
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
