'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PAYOUT_MODES, recordPayout, settlementKeys, type PayoutMode } from '@/lib/admin/settlements';
import type { Settlement } from '@/lib/marketplace/settlement';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

export default function RecordPayoutDialog({ settlement, onClose }: { settlement: Settlement; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<PayoutMode>('NEFT');
  const [utr, setUtr] = useState('');
  const [error, setError] = useState('');

  const pay = useMutation({
    mutationFn: () => recordPayout(settlement.id, { payment_mode: mode, utr_reference: utr.trim() }),
    onSuccess: () => {
      toast.success(`${settlement.batch_ref} marked paid`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not record payout')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settlementKeys.all }),
  });

  const submit = () => {
    if (utr.trim().length < 6) return setError('Enter the UTR / reference (at least 6 characters)');
    setError('');
    pay.mutate();
  };

  return (
    <Modal title={`Record payout — ${settlement.batch_ref}`} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        {settlement.partner_name} · net {formatPrice(settlement.net_payable_paise)}
      </p>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Payment mode</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as PayoutMode)} className="input">
          {PAYOUT_MODES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm mt-3">
        <span className="block font-medium text-gray-700 mb-1">UTR / reference</span>
        <input value={utr} onChange={(e) => setUtr(e.target.value)} maxLength={50} className="input" />
      </label>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Record payout" pending={pay.isPending} error={error} />
    </Modal>
  );
}
