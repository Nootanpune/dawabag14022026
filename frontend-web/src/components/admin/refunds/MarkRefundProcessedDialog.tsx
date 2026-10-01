'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { markRefundProcessed, returnKeys, type Refund } from '@/lib/returns/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/** Record a manual refund (bank transfer) with its UTR (C-37). */
export default function MarkRefundProcessedDialog({ refund, onClose }: { refund: Refund; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => markRefundProcessed(refund.id, reference.trim()),
    onSuccess: () => {
      toast.success('Refund marked as paid');
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not update the refund')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: returnKeys.all }),
  });
  return (
    <Modal title={`Refund ${formatPrice(refund.amount_paise)} · ${refund.order_number}`} onClose={onClose}>
      <p className="text-xs text-gray-600 mb-3">
        Pay the buyer by bank transfer first, then enter the UTR / bank reference here.
      </p>
      <label className="block text-sm font-medium text-gray-700 mb-1">UTR / reference</label>
      <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} className="input font-mono" autoFocus />
      <DialogActions
        onCancel={onClose}
        onConfirm={() => (reference.trim().length < 3 ? setError('Enter the UTR (at least 3 characters)') : save.mutate())}
        confirmLabel="Mark paid"
        pending={save.isPending}
        error={error}
      />
    </Modal>
  );
}
