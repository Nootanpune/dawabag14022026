'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MAX_MANDATE_PAISE, startMandate } from '@/lib/refills';
import { openMandateCheckout } from '@/lib/razorpayMandate';
import { rupeesToPaise } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatPrice } from '@/lib/utils';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

export const AUTOPAY_UNAVAILABLE = 'Automatic payment is not available yet';

export default function TurnOnAutoPayDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<'upi' | 'card'>('upi');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState('');

  const start = useMutation({
    mutationFn: (max_amount_paise: number) => startMandate({ max_amount_paise, method }),
    onSuccess: (checkout) => {
      onDone();
      if (!openMandateCheckout(checkout, onDone)) {
        toast.info('We could not open the payment window here. Please try again later.');
      }
      onClose();
    },
    onError: (err: any) => {
      if (err?.response?.status === 503) setError(AUTOPAY_UNAVAILABLE);
      else setError(getApiErrorMessage(err, 'Could not start automatic payment'));
    },
  });

  const submit = () => {
    const paise = rupeesToPaise(limit);
    if (paise == null || paise <= 0) return setError('Enter the most we may charge per refill');
    if (paise > MAX_MANDATE_PAISE) return setError(`The limit is ${formatPrice(MAX_MANDATE_PAISE)} per charge`);
    setError('');
    start.mutate(paise);
  };

  return (
    <Modal title="Turn on automatic payment" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <fieldset>
          <legend className="font-medium text-gray-700 mb-1">Pay with</legend>
          <div className="flex gap-4">
            {(['upi', 'card'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                {m === 'upi' ? 'UPI AutoPay' : 'Card'}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Maximum per refill (₹)</span>
          <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" className="input" />
          <span className="block text-xs text-gray-400 mt-1">Up to {formatPrice(MAX_MANDATE_PAISE)} per charge.</span>
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Continue" pending={start.isPending} error={error} />
    </Modal>
  );
}
