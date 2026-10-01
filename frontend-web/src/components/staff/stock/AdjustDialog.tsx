'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { requestAdjustment } from '@/lib/stock/api';
import { ADJUSTMENT_REASONS, type AdjustmentReason, type Batch } from '@/lib/stock/types';
import { REASON_LABELS, reasonDirection } from '@/lib/stock/labels';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

/** Request a stock change; it applies only after a second person approves it (C-46). */
export default function AdjustDialog({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<AdjustmentReason>('damaged');
  const [sign, setSign] = useState<1 | -1>(-1);
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const dir = reasonDirection(reason);
  const effectiveSign = dir === 'add' ? 1 : dir === 'remove' ? -1 : sign;
  const free = batch.quantity_available - batch.quantity_reserved;

  const save = useMutation({
    mutationFn: requestAdjustment,
    onSuccess: (r) => {
      toast.success(`${r.adjustment_no} sent for approval`);
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not request the adjustment')),
  });

  const submit = () => {
    if (!/^\d+$/.test(qty.trim()) || Number(qty) < 1) return setError('Enter a whole number of units above 0');
    if (effectiveSign < 0 && Number(qty) > free) return setError(`Only ${free} unit(s) are free (the rest are reserved for orders)`);
    if (notes.trim().length < 5) return setError('Explain the adjustment (at least 5 characters)');
    setError('');
    save.mutate({ batch_id: batch.id, quantity_delta: effectiveSign * Number(qty), reason, notes: notes.trim() });
  };

  return (
    <Modal title="Adjust stock" onClose={onClose}>
      <p className="text-sm mb-3">
        <span className="font-medium">{batch.product_name}</span>
        <span className="text-gray-500">
          {' '}
          · batch {batch.batch_number} · {batch.quantity_available} on hand, {free} free
        </span>
      </p>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} className="input">
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3 items-end">
          {dir === 'either' ? (
            <select value={sign} onChange={(e) => setSign(Number(e.target.value) as 1 | -1)} className="input w-32">
              <option value={-1}>Remove</option>
              <option value={1}>Add</option>
            </select>
          ) : (
            <span className="text-xs text-gray-500 pb-2.5 w-32">{dir === 'add' ? 'Adds stock' : 'Removes stock'}</span>
          )}
          <label className="block flex-1">
            <span className="block font-medium text-gray-700 mb-1">Units</span>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className="input" />
          </label>
        </div>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} className="input" />
        </label>
        <p className="text-xs text-gray-400">An admin other than you must approve before stock changes.</p>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Request adjustment" pending={save.isPending} error={error} />
    </Modal>
  );
}
