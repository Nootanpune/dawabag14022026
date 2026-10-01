'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { settleCredit, type OpenCreditOrder } from '@/lib/admin/credit';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';
import Modal from '../Modal';

export default function RecordPaymentDialog({ order, onClose }: { order: OpenCreditOrder; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const settle = useMutation({
    mutationFn: () => settleCredit(order.id, { payment_reference: reference.trim(), notes: notes.trim() || undefined }),
    onSuccess: (res) => {
      toast.success(`Payment of ${formatPrice(res.amount_paise)} recorded for ${order.order_number}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record payment')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'credit'] }),
  });

  return (
    <Modal title={`Record payment — ${order.order_number}`} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        {order.business_name || order.mobile} · {formatPrice(order.total_paise)}
      </p>
      <label className="block text-sm font-medium text-gray-700 mb-1">Payment reference</label>
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="UTR / cheque no."
        className="input"
        autoFocus
      />
      <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">
        Notes <span className="text-gray-400">(optional)</span>
      </label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" />
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn-outline text-sm">
          Cancel
        </button>
        <button
          onClick={() => (reference.trim() ? settle.mutate() : setError('Payment reference is required'))}
          disabled={settle.isPending}
          className="btn-primary text-sm inline-flex items-center gap-2"
        >
          {settle.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Record payment
        </button>
      </div>
    </Modal>
  );
}
