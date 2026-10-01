'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { recordDisposal } from '@/lib/stock/api';
import type { Adjustment, DisposalMethod } from '@/lib/stock/types';
import { DISPOSAL_LABELS } from '@/lib/stock/labels';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/** Completes a destruction-register entry: how, the vendor / manifest reference, and the witness (C-28, C-34). */
export default function DisposalDialog({ adjustment: a, onClose }: { adjustment: Adjustment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<DisposalMethod>('authorised_vendor');
  const [reference, setReference] = useState('');
  const [witness, setWitness] = useState('');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => recordDisposal(a.id, { method, reference: reference.trim(), witness: witness.trim() }),
    onSuccess: () => {
      toast.success(`Destruction of ${a.adjustment_no} recorded`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record the destruction')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['stock'] }),
  });

  const submit = () => {
    if (reference.trim().length < 3) return setError('Enter the destruction reference (certificate / manifest no.)');
    if (witness.trim().length < 3) return setError('Enter the witness name');
    setError('');
    save.mutate();
  };

  return (
    <Modal title={`Record destruction · ${a.adjustment_no}`} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        {Math.abs(a.quantity_delta)} × {a.product_name}, batch {a.batch_number}
      </p>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as DisposalMethod)} className="input">
            {Object.entries(DISPOSAL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Reference</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Witness</span>
          <input value={witness} onChange={(e) => setWitness(e.target.value)} maxLength={150} className="input" />
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Record destruction" pending={save.isPending} error={error} />
    </Modal>
  );
}
