'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { applyPrescription, fulfilmentKeys } from '@/lib/fulfilment/api';
import type { RxQueueItem } from '@/lib/fulfilment/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reuse the buyer's verified, unexpired prescription for this order (e.g. a refill),
// within the quantity it still allows (C-08). The server checks owner, expiry and balance.
export default function ApplyRxDialog({ item, onClose }: { item: RxQueueItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rxId, setRxId] = useState('');
  const [error, setError] = useState('');
  const apply = useMutation({
    mutationFn: () => applyPrescription(rxId.trim(), item.order_id),
    onSuccess: (r) => {
      toast.success(`${item.order_number}: ${r.lines_covered} line(s) covered by the existing prescription`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not apply the prescription')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fulfilmentKeys.all }),
  });

  const submit = () => {
    if (!UUID.test(rxId.trim())) return setError('Enter a prescription ID');
    setError('');
    apply.mutate();
  };

  return (
    <Modal title={`Use an existing prescription — ${item.order_number}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        The prescription must be verified, unexpired, belong to the same buyer and still allow the ordered quantity.
      </p>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Verified prescription ID</span>
        <input value={rxId} onChange={(e) => setRxId(e.target.value)} className="input font-mono text-xs" autoFocus />
      </label>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Apply" pending={apply.isPending} error={error} />
    </Modal>
  );
}
