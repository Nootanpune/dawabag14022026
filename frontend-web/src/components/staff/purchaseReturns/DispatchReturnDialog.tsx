'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dispatchPurchaseReturn, purchaseReturnKeys } from '@/lib/purchaseReturns/api';
import type { PurchaseReturn } from '@/lib/purchaseReturns/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/** Goods leave for the supplier under an e-way bill, LR or AWB number. */
export default function DispatchReturnDialog({ r, onClose }: { r: PurchaseReturn; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const dispatch = useMutation({
    mutationFn: () => dispatchPurchaseReturn(r.id, ref.trim()),
    onSuccess: () => {
      toast.success(`${r.return_no} dispatched`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record dispatch')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: purchaseReturnKeys.all }),
  });

  const submit = () => {
    const n = ref.trim().length;
    if (n < 3 || n > 100) return setError('Dispatch reference must be 3–100 characters');
    setError('');
    dispatch.mutate();
  };

  return (
    <Modal title={`Dispatch ${r.return_no}`} onClose={onClose}>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Dispatch reference</span>
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} className="input" autoFocus placeholder="E-way bill, LR or AWB number" />
      </label>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Mark dispatched" pending={dispatch.isPending} error={error} />
    </Modal>
  );
}
