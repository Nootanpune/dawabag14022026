'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRecall, recallKeys, type ProductHit, type RecallResult } from '@/lib/recalls/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import ProductPicker from './ProductPicker';

interface Props {
  onClose: () => void;
  onDone: (r: RecallResult) => void;
}

// Recalling blocks the batch everywhere (own + partner stock) and notifies buyers (C-28).
export default function NewRecallDialog({ onClose, onDone }: Props) {
  const queryClient = useQueryClient();
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [batch, setBatch] = useState('');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createRecall({
        product_id: product!.id,
        batch_number: batch.trim(),
        reason: reason.trim(),
        ...(source.trim() ? { source: source.trim() } : {}),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: recallKeys.list });
      onDone(r);
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record the recall')),
  });

  const submit = () => {
    if (!product) return setError('Pick the product');
    if (!batch.trim()) return setError('Enter the batch number');
    if (reason.trim().length < 5) return setError('Enter the reason (at least 5 characters)');
    setError('');
    create.mutate();
  };

  return (
    <Modal title="Recall a batch" onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <div>
          <span className="block font-medium text-gray-700 mb-1">Product</span>
          <ProductPicker value={product} onChange={setProduct} />
        </div>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Batch number</span>
          <input value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={100} className="input font-mono" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Reason</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Source (optional)</span>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={100}
            placeholder="e.g. CDSCO alert, manufacturer notice"
            className="input"
          />
        </label>
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
          This cannot be undone here. The batch is blocked from packing and dispatch, and buyers who received it are notified.
        </p>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Recall batch" pending={create.isPending} danger error={error} />
    </Modal>
  );
}
