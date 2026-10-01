'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { purchaseReturnKeys, settlePurchaseReturn } from '@/lib/purchaseReturns/api';
import type { PurchaseReturn } from '@/lib/purchaseReturns/types';
import { creditDifferenceText, isIsoDate } from '@/lib/purchaseReturns/labels';
import { formatPaise, rupeesToPaise } from '@/lib/admin/format';
import { todayIST } from '@/lib/fulfilment/roles';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { isLockedPeriodError } from '@/lib/admin/accountsLock';
import LockedPeriodBanner from '@/components/admin/accounts/LockedPeriodBanner';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

interface Props {
  r: PurchaseReturn;
  onClose: () => void;
  /** difference_paise from the server (credit − return total) */
  onSettled: (differencePaise: number) => void;
}

/** Record the supplier's credit note against the dispatched return; any shortfall is shown, not hidden. */
export default function SettleReturnDialog({ r, onClose, onSettled }: Props) {
  const queryClient = useQueryClient();
  const [no, setNo] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState(() => (Number(r.total_paise) / 100).toFixed(2));
  const [error, setError] = useState('');
  // Credit note dated in a closed GST period (409, Sprint 13)
  const [lockedPeriod, setLockedPeriod] = useState('');
  const settle = useMutation({
    mutationFn: () =>
      settlePurchaseReturn(r.id, { supplier_credit_note_no: no.trim(), supplier_credit_note_date: date, supplier_credit_paise: rupeesToPaise(amount) ?? 0 }),
    onSuccess: (d) => {
      const diff = creditDifferenceText(d.difference_paise);
      toast.success(`${r.return_no} settled${diff ? ` · credit ${diff}` : ''}`);
      onSettled(d.difference_paise);
      onClose();
    },
    onError: (err) => {
      const msg = getApiErrorMessage(err, 'Could not record the credit note');
      if (isLockedPeriodError(msg)) return setLockedPeriod(msg);
      setError(msg);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: purchaseReturnKeys.all }),
  });

  const submit = () => {
    if (!no.trim() || no.trim().length > 60) return setError('Enter the credit note number (up to 60 characters)');
    if (!isIsoDate(date)) return setError('Enter the credit note date');
    if (date > todayIST()) return setError('Credit note date cannot be in the future');
    if (!amount.trim() || rupeesToPaise(amount) == null) return setError('Enter the credit amount in rupees');
    setError('');
    setLockedPeriod('');
    settle.mutate();
  };

  return (
    <Modal title={`Supplier credit note for ${r.return_no}`} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">Return total {formatPaise(r.total_paise)} incl. GST.</p>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Credit note number</span>
          <input value={no} onChange={(e) => setNo(e.target.value)} maxLength={60} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Credit note date</span>
          <input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Amount credited (₹)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="input" />
        </label>
      </div>
      {lockedPeriod && (
        <div className="mt-3">
          <LockedPeriodBanner message={lockedPeriod} />
        </div>
      )}
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Record credit note" pending={settle.isPending} error={error} />
    </Modal>
  );
}
