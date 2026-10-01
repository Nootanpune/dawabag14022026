'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { setPartnerCommission, type ApprovedVendor } from '@/lib/admin/partners';
import { rupeesToPaise } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

export default function CommissionDialog({ vendor, onClose }: { vendor: ApprovedVendor; onClose: () => void }) {
  const [pct, setPct] = useState('');
  const [fee, setFee] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (body: { commission_pct: number; finding_fee_paise: number }) => setPartnerCommission(vendor.id, body),
    onSuccess: () => {
      toast.success(`Commission saved for ${vendor.name}`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not save commission')),
  });

  const submit = () => {
    const commission = Number(pct);
    const findingFee = rupeesToPaise(fee || '0');
    if (pct.trim() === '' || !Number.isFinite(commission) || commission < 0 || commission > 50) {
      return setError('Commission must be between 0 and 50%');
    }
    if (findingFee == null) return setError('Enter the finding fee in rupees');
    setError('');
    save.mutate({ commission_pct: commission, finding_fee_paise: findingFee });
  };

  return (
    <Modal title={`Commission — ${vendor.name}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        The agreed rate applies to shipments settled from now on. Enter both values; they replace the current agreement.
      </p>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Commission (%)</span>
          <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Finding fee per order (₹)</span>
          <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0" className="input" />
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={save.isPending} error={error} />
    </Modal>
  );
}
